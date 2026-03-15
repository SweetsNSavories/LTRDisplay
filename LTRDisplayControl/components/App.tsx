import * as React from 'react';
import { IInputs } from "../generated/ManifestTypes";
import { LtrService, IViewDefinition, IFormDefinition, IRelatedRelationship } from '../services/LtrService';
import { XmlParserHelper, IGridColumn, IFormTab } from '../utils/XmlParser';
import { DynamicGrid } from './DynamicGrid';
import { DynamicForm } from './DynamicForm';
import { ComboBox, IComboBoxOption } from '@fluentui/react/lib/ComboBox';
import { Spinner, SpinnerSize } from '@fluentui/react/lib/Spinner';
import { Toggle } from '@fluentui/react/lib/Toggle';
import { TextField } from '@fluentui/react/lib/TextField';
import { PrimaryButton, DefaultButton } from '@fluentui/react/lib/Button';
import { diag } from '../utils/Diagnostics';

interface IAppProps {
    context: ComponentFramework.Context<IInputs>;
    targetEntity: string;
    isArchive: boolean;
    ltrEntities: string;
}

interface IEntityOption {
    logicalName: string;
    displayName?: string;
}

interface IDetailContext {
    entity: string;
    record: any;
    recordId?: string;
    forms: IFormDefinition[];
    selectedFormId?: string;
    definitions: IFormTab[];
    relatedDefinitions: IRelatedRelationship[];
    relatedData: Record<string, any[]>;
    relatedLoading: Record<string, boolean>;
}

interface IUserCache {
    views: Record<string, any[]>;
    related: Record<string, any[]>;
    forms: Record<string, IFormDefinition[]>;
    relationships: Record<string, IRelatedRelationship[]>;
}

interface ILtrBrowserCache {
    byUser: Record<string, IUserCache>;
}

const GUID_REGEX = /^\{?[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\}?$/i;

function getBrowserCache(userId: string): IUserCache {
    const key = '__ltrDisplayCache';
    const globalObj = window as any;
    const root: ILtrBrowserCache = globalObj[key] || { byUser: {} };
    if (!root.byUser[userId]) {
        root.byUser[userId] = { views: {}, related: {}, forms: {}, relationships: {} };
    }
    globalObj[key] = root;
    return root.byUser[userId];
}

function getViewCacheKey(entity: string, viewId: string, archiveMode: boolean): string {
    return `${entity}|${viewId}|${archiveMode ? 'retained' : 'active'}`;
}

function getRelatedCacheKey(entity: string, recordId: string, relationshipKey: string, archiveMode: boolean): string {
    return `${entity}|${recordId}|${relationshipKey}|${archiveMode ? 'retained' : 'active'}`;
}

function getFormsCacheKey(entity: string): string {
    return entity.toLowerCase();
}

function getRelationshipsCacheKey(entity: string): string {
    return entity.toLowerCase();
}

function normalizeGuid(value?: string): string | undefined {
    if (!value) return undefined;
    return value.replace(/[{}]/g, '').toLowerCase();
}

function resolveRecordId(record: any, entity: string): string | undefined {
    if (!record || typeof record !== 'object') {
        return undefined;
    }

    const candidates: string[] = [];
    const primaryIdKey = `${entity}id`;

    if (typeof record[primaryIdKey] === 'string') {
        candidates.push(record[primaryIdKey]);
    }
    if (typeof record.id === 'string') {
        candidates.push(record.id);
    }

    Object.keys(record).forEach((k) => {
        const value = record[k];
        if (typeof value === 'string' && (k.toLowerCase().endsWith('id') || /^_.*_value$/i.test(k))) {
            candidates.push(value);
        }
    });

    const match = candidates.find(v => GUID_REGEX.test(v));
    return normalizeGuid(match);
}

function getLastUsedFormKey(entity: string): string {
    return `LTRDisplay.lastForm.${entity}`;
}

function readLastUsedForm(entity: string): string | undefined {
    try {
        return window.localStorage.getItem(getLastUsedFormKey(entity)) || undefined;
    } catch {
        return undefined;
    }
}

function writeLastUsedForm(entity: string, formId: string): void {
    try {
        window.localStorage.setItem(getLastUsedFormKey(entity), formId);
    } catch {
        // Ignore storage failures in restricted contexts.
    }
}

function getRecordTitle(record: any, entity: string): string {
    if (!record || typeof record !== 'object') {
        return 'Record';
    }

    const preferred = [`${entity}name`, 'fullname', 'name', 'subject', 'title'];
    for (const key of preferred) {
        const formatted = record[`${key}@OData.Community.Display.V1.FormattedValue`];
        if (formatted) return String(formatted);
        if (record[key]) return String(record[key]);
    }

    const fallbackFormatted = Object.keys(record).find(k => k.endsWith('@OData.Community.Display.V1.FormattedValue'));
    if (fallbackFormatted && record[fallbackFormatted]) {
        return String(record[fallbackFormatted]);
    }

    return 'Record';
}

function escapeXml(value: string): string {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}

function appendInitialFetchClause(fetchXml: string, column?: string, text?: string): string {
    const attr = (column || '').trim();
    const query = (text || '').trim();

    if (!attr || !query) {
        return fetchXml;
    }

    const condition = `<filter type="and"><condition attribute="${escapeXml(attr)}" operator="like" value="%${escapeXml(query)}%" /></filter>`;
    const idx = fetchXml.lastIndexOf('</entity>');
    if (idx < 0) {
        return fetchXml;
    }

    return `${fetchXml.slice(0, idx)}${condition}${fetchXml.slice(idx)}`;
}

const App: React.FC<IAppProps> = (props) => {
    const { context, targetEntity, isArchive } = props;

    const [entityOptions, setEntityOptions] = React.useState<IEntityOption[]>([]);
    const [selectedEntity, setSelectedEntity] = React.useState<string>(targetEntity || "");
    const [archiveMode, setArchiveMode] = React.useState<boolean>(isArchive);
    const ltrService = React.useMemo(() => new LtrService(context, selectedEntity), [context, selectedEntity]);
    const [loading, setLoading] = React.useState<boolean>(false);
    const [views, setViews] = React.useState<IViewDefinition[]>([]);
    const [detailsForms, setDetailsForms] = React.useState<IFormDefinition[]>([]);

    const [selectedViewId, setSelectedViewId] = React.useState<string>();
    const [selectedFormId, setSelectedFormId] = React.useState<string>();

    const [gridData, setGridData] = React.useState<any[]>([]);
    const [gridColumns, setGridColumns] = React.useState<IGridColumn[]>([]);
    const [columnFilters, setColumnFilters] = React.useState<Record<string, string>>({});
    const [definitions, setDefinitions] = React.useState<IFormTab[]>([]);
    const [searchColumn, setSearchColumn] = React.useState<string>();
    const [searchText, setSearchText] = React.useState<string>("");
    const [pageSize, setPageSize] = React.useState<number>(250);
    const [currentPage, setCurrentPage] = React.useState<number>(1);

    const [viewMode, setViewMode] = React.useState<'GRID' | 'FORM'>('GRID');
    const [detailContext, setDetailContext] = React.useState<IDetailContext>();
    const [detailStack, setDetailStack] = React.useState<IDetailContext[]>([]);

    const getCurrentUserCache = React.useCallback(() => {
        const userId = normalizeGuid(context.userSettings.userId) || 'anonymous';
        return getBrowserCache(userId);
    }, [context.userSettings.userId]);

    const loadFormsForEntity = React.useCallback(async (entity: string): Promise<IFormDefinition[]> => {
        const cache = getCurrentUserCache();
        const key = getFormsCacheKey(entity);
        if (cache.forms[key]) {
            return cache.forms[key];
        }

        const service = new LtrService(context, entity);
        const forms = await service.getSystemForms();
        cache.forms[key] = forms;
        return forms;
    }, [context, getCurrentUserCache]);

    const loadRelationshipsForEntity = React.useCallback(async (entity: string): Promise<IRelatedRelationship[]> => {
        const cache = getCurrentUserCache();
        const key = getRelationshipsCacheKey(entity);
        if (cache.relationships[key]) {
            return cache.relationships[key];
        }

        const service = new LtrService(context, entity);
        const relationships = await service.getOneToManyRelationships();
        cache.relationships[key] = relationships;
        return relationships;
    }, [context, getCurrentUserCache]);

    React.useEffect(() => {
        const loadEntityOptions = async () => {
            diag.info("Loading Select Entity options", {
                targetEntity,
                hasConfiguredLtrEntities: !!(props.ltrEntities || '').trim()
            });

            const metadataService = new LtrService(context, targetEntity || 'account');
            const retentionEntities = await metadataService.getRetentionEnabledEntities();
            const effectiveEntities = retentionEntities.map(e => ({
                logicalName: e.logicalName,
                displayName: e.displayName
            }));

            diag.info("Loaded retention-enabled entity metadata", {
                count: effectiveEntities.length,
                sample: effectiveEntities.slice(0, 10).map(e => e.logicalName)
            });

            if (effectiveEntities.length === 0) {
                diag.info("Select Entity options empty after retention metadata load");
                setEntityOptions([]);
                setSelectedEntity("");
                return;
            }

            setEntityOptions(effectiveEntities);

            if (!selectedEntity || !effectiveEntities.some(e => e.logicalName === selectedEntity)) {
                const targetAllowed = effectiveEntities.find(e => e.logicalName === targetEntity)?.logicalName;
                const fallback = targetAllowed || effectiveEntities[0]?.logicalName || "";
                diag.info("Selecting fallback entity", { targetAllowed, fallback });
                setSelectedEntity(fallback);
            }
        };

        loadEntityOptions();
    }, [targetEntity, context]);

    const handleViewChange = async (viewId: string, currentViews = views) => {
        setLoading(true);
        try {
            setSelectedViewId(viewId);
            const view = currentViews.find(v => v.id === viewId);
            if (!view) {
                diag.error("Selected view not found", null, { viewId });
                return;
            }

            const columns = XmlParserHelper.parseLayoutXml(view.layoutXml);
            setGridColumns(columns);
            setSearchColumn(columns[0]?.name);
            setColumnFilters({});
            setCurrentPage(1);

            const userId = normalizeGuid(context.userSettings.userId) || 'anonymous';
            const userCache = getBrowserCache(userId);
            const effectiveFetchXml = appendInitialFetchClause(view.fetchXml, searchColumn, searchText);
            const clauseKey = `${searchColumn || ''}|${(searchText || '').trim().toLowerCase()}`;
            const cacheKey = `${getViewCacheKey(selectedEntity, viewId, archiveMode)}|${clauseKey}`;
            const cached = userCache.views[cacheKey];

            const data = cached || await ltrService.getLtrData(effectiveFetchXml, archiveMode);
            if (!cached) {
                userCache.views[cacheKey] = data;
                diag.info("View data cached", { cacheKey, count: data.length });
            } else {
                diag.info("View data loaded from browser cache", { cacheKey, count: data.length });
            }
            setGridData(data);
            diag.info("Grid data loaded", { count: data.length });
        } catch (err) {
            diag.error("View change failed", err, { viewId, isArchive, entity: selectedEntity });
        } finally {
            setLoading(false);
        }
    };

    React.useEffect(() => {
        if (!selectedEntity) {
            return;
        }

        const loadMetadata = async () => {
            setLoading(true);
            try {
                const service = new LtrService(context, selectedEntity);
                const vs = await service.getSystemViews();
                const fs = await loadFormsForEntity(selectedEntity);

                setViews(vs);
                setDetailsForms(fs);

                if (vs.length > 0) {
                    await handleViewChange(vs[0].id, vs);
                } else {
                    setGridColumns([]);
                    setGridData([]);
                }

                if (fs.length > 0) {
                    const preferredFormId = readLastUsedForm(selectedEntity);
                    const defaultForm = fs.find(f => f.id === preferredFormId) || fs[0];
                    setSelectedFormId(defaultForm.id);
                    writeLastUsedForm(selectedEntity, defaultForm.id);
                    setDefinitions(XmlParserHelper.parseFormXml(defaultForm.formXml));
                } else {
                    setSelectedFormId(undefined);
                    setDefinitions([]);
                }
            } catch (err) {
                diag.error("Metadata load failed", err, { entity: selectedEntity });
            } finally {
                setLoading(false);
            }
        };

        loadMetadata();
    }, [selectedEntity, archiveMode, context, loadFormsForEntity]);

    const handleRecordSelect = async (recordRef: any) => {
        try {
            const incomingRecord = typeof recordRef === 'object' && recordRef ? recordRef : null;
            const id = typeof recordRef === 'string' ? normalizeGuid(recordRef) : resolveRecordId(recordRef, selectedEntity);

            let record = incomingRecord || undefined;
            if (!record && id) {
                record = gridData.find(r => resolveRecordId(r, selectedEntity) === id);
            }

            if (!record) {
                diag.error("Record not found", null, { id, entity: selectedEntity });
                return;
            }

            const rootForms = detailsForms;
            const rootSelectedFormId = selectedFormId || rootForms[0]?.id;
            const rootForm = rootForms.find(f => f.id === rootSelectedFormId) || rootForms[0];
            const rootDefinitions = rootForm ? XmlParserHelper.parseFormXml(rootForm.formXml) : definitions;

            setDetailStack([]);
            const relatedDefinitions = await loadRelationshipsForEntity(selectedEntity);
            setDetailContext({
                entity: selectedEntity,
                record,
                recordId: id || resolveRecordId(record, selectedEntity),
                forms: rootForms,
                selectedFormId: rootSelectedFormId,
                definitions: rootDefinitions,
                relatedDefinitions,
                relatedData: {},
                relatedLoading: {}
            });
            setViewMode('FORM');
        } catch (err) {
            diag.error("Record select failed", err, { entity: selectedEntity, archiveMode });
        }
    };

    const handleDetailFormChange = async (formId: string) => {
        if (!detailContext) return;
        const form = detailContext.forms.find(f => f.id === formId);
        if (!form) return;

        writeLastUsedForm(detailContext.entity, formId);
        const parsed = XmlParserHelper.parseFormXml(form.formXml);
        setDetailContext({
            ...detailContext,
            selectedFormId: formId,
            definitions: parsed
        });
    };

    const handleLoadRelated = async (relationship: IRelatedRelationship, forceReload: boolean = false) => {
        if (!detailContext?.recordId) {
            diag.info("Skipping related load: selected record has no resolvable id", { relationship: relationship.schemaName });
            return;
        }

        if (!forceReload && detailContext.relatedData[relationship.key]) {
            return;
        }

        const userCache = getCurrentUserCache();
        const cacheKey = getRelatedCacheKey(detailContext.entity, detailContext.recordId, relationship.key, archiveMode);
        const cached = userCache.related[cacheKey];
        if (!forceReload && cached) {
            setDetailContext(prev => prev ? {
                ...prev,
                relatedData: { ...prev.relatedData, [relationship.key]: cached }
            } : prev);
            diag.info("Related data loaded from browser cache", { cacheKey, count: cached.length });
            return;
        }

        setDetailContext(prev => prev ? {
            ...prev,
            relatedLoading: { ...prev.relatedLoading, [relationship.key]: true }
        } : prev);

        try {
            const service = new LtrService(context, detailContext.entity);
            const rows = await service.getRelatedRecords(relationship, detailContext.recordId, archiveMode);
            userCache.related[cacheKey] = rows;
            setDetailContext(prev => prev ? {
                ...prev,
                relatedData: { ...prev.relatedData, [relationship.key]: rows }
            } : prev);
        } finally {
            setDetailContext(prev => prev ? {
                ...prev,
                relatedLoading: { ...prev.relatedLoading, [relationship.key]: false }
            } : prev);
        }
    };

    const handleOpenRelatedRecord = async (entity: string, id?: string, row?: any) => {
        if (!detailContext) return;

        const normalizedId = normalizeGuid(id);
        const record = row;

        if (!record) {
            diag.error("Unable to open related record", null, { entity, id });
            return;
        }

        const forms = await loadFormsForEntity(entity);
        const relatedDefinitions = await loadRelationshipsForEntity(entity);
        const preferred = readLastUsedForm(entity);
        const selected = forms.find(f => f.id === preferred) || forms[0];
        const parsed = selected ? XmlParserHelper.parseFormXml(selected.formXml) : [];

        const nextContext: IDetailContext = {
            entity,
            record,
            recordId: normalizedId || resolveRecordId(record, entity),
            forms,
            selectedFormId: selected?.id,
            definitions: parsed,
            relatedDefinitions,
            relatedData: {},
            relatedLoading: {}
        };

        setDetailStack(prev => [...prev, detailContext]);
        setDetailContext(nextContext);
        setViewMode('FORM');
    };

    const handleBackFromDetail = () => {
        if (detailStack.length === 0) {
            setDetailContext(undefined);
            setViewMode('GRID');
            return;
        }

        const previous = detailStack[detailStack.length - 1];
        setDetailStack(prev => prev.slice(0, -1));
        setDetailContext(previous);
        setViewMode('FORM');
    };

    const handleEntityChange = (_ev: any, option?: IComboBoxOption, _index?: number, value?: string) => {
        const raw = option?.key?.toString() || value || "";
        if (!raw) return;

        const match = entityOptions.find(e => e.logicalName.toLowerCase() === raw.toLowerCase() || (e.displayName || "").toLowerCase() === raw.toLowerCase());
        const next = match ? match.logicalName : raw;

        setSelectedEntity(next);
        setSearchText("");
        setSearchColumn(undefined);
        setColumnFilters({});
        setCurrentPage(1);
        setDetailContext(undefined);
        setDetailStack([]);
        setViewMode('GRID');
    };

    const onToggleArchive = (_ev: any, checked?: boolean) => {
        setArchiveMode(!!checked);
    };

    const filteredGridData = React.useMemo(() => {
        const matchesQuery = (row: any, column: string, query: string): boolean => {
            const queryLower = query.toLowerCase();
            const formatted = row?.[`${column}@OData.Community.Display.V1.FormattedValue`];
            const raw = formatted ?? row?.[column];

            if (raw === null || raw === undefined) {
                return false;
            }

            if (typeof raw === 'number') {
                const num = Number(query);
                return Number.isFinite(num) && raw === num;
            }

            if (typeof raw === 'boolean') {
                const bool = queryLower === 'true' || queryLower === '1' || queryLower === 'yes';
                const isBoolToken = ['true', 'false', '1', '0', 'yes', 'no'].includes(queryLower);
                return isBoolToken ? raw === bool : false;
            }

            return String(raw).toLowerCase().includes(queryLower);
        };

        const headerFilters = Object.entries(columnFilters)
            .map(([column, value]) => ({ column, value: (value || '').trim() }))
            .filter(f => !!f.value);
        const activeFilters = [...headerFilters];

        if (activeFilters.length === 0) {
            return gridData;
        }

        return gridData.filter((row) => activeFilters.every(f => matchesQuery(row, f.column, f.value)));
    }, [gridData, columnFilters]);

    const handleColumnFilterChange = React.useCallback((columnName: string, value: string) => {
        setColumnFilters((prev) => ({
            ...prev,
            [columnName]: value
        }));
        setCurrentPage(1);
    }, []);

    const totalRows = filteredGridData.length;
    const totalPages = Math.max(1, Math.ceil(totalRows / pageSize));

    React.useEffect(() => {
        setCurrentPage(prev => Math.min(Math.max(prev, 1), totalPages));
    }, [totalPages]);

    const pagedGridData = React.useMemo(() => {
        const start = (currentPage - 1) * pageSize;
        return filteredGridData.slice(start, start + pageSize);
    }, [filteredGridData, currentPage, pageSize]);

    const pageStart = totalRows === 0 ? 0 : ((currentPage - 1) * pageSize) + 1;
    const pageEnd = Math.min(currentPage * pageSize, totalRows);

    const entityOptionsForUi: IComboBoxOption[] = entityOptions.map(e => ({
        key: e.logicalName,
        text: e.displayName ? `${e.displayName} (${e.logicalName})` : e.logicalName
    }));

    return (
        <div className="ltr-app">
            {loading && <Spinner size={SpinnerSize.large} label="Loading LTR Data..." />}

            <div className="ltr-header">
                <ComboBox
                    label="Select Entity"
                    selectedKey={selectedEntity || undefined}
                    options={entityOptionsForUi}
                    allowFreeform
                    autoComplete="on"
                    onChange={handleEntityChange}
                    useComboBoxAsMenuWidth
                    placeholder="Type logical or display name"
                    disabled={loading}
                    styles={{ root: { width: 300 } }}
                />

                <ComboBox
                    label="Select View"
                    selectedKey={selectedViewId}
                    options={views.map(v => ({ key: v.id, text: v.name }))}
                    onChange={(_e, opt) => {
                        if (opt?.key) {
                            handleViewChange(opt.key as string);
                        }
                    }}
                    autoComplete="on"
                    useComboBoxAsMenuWidth
                    disabled={loading || views.length === 0 || viewMode !== 'GRID'}
                    styles={{ root: { width: 300 } }}
                />

                <ComboBox
                    label="Search Column"
                    selectedKey={searchColumn}
                    options={gridColumns.map(c => ({ key: c.name, text: c.displayName || c.name }))}
                    onChange={(_e, opt) => setSearchColumn(opt?.key as string)}
                    autoComplete="on"
                    useComboBoxAsMenuWidth
                    disabled={loading || gridColumns.length === 0 || viewMode !== 'GRID'}
                    styles={{ root: { width: 220 } }}
                />

                <TextField
                    label="Search"
                    value={searchText}
                    onChange={(_e, value) => setSearchText(value || "")}
                    disabled={loading || viewMode !== 'GRID'}
                    styles={{ root: { width: 220 } }}
                />

                <PrimaryButton
                    text="Apply Fetch Clause"
                    onClick={() => selectedViewId && handleViewChange(selectedViewId)}
                    disabled={loading || !selectedViewId || viewMode !== 'GRID'}
                    styles={{ root: { alignSelf: 'flex-end' } }}
                />

                <Toggle
                    label="Data Source"
                    onText="Archive (LTR)"
                    offText="Active (Dataverse)"
                    checked={archiveMode}
                    onChange={onToggleArchive}
                    disabled={loading}
                    styles={{ root: { width: 180 } }}
                />
            </div>

            <div className="ltr-content">
                {!loading && viewMode === 'GRID' && (
                    <>
                        <DynamicGrid
                            columns={gridColumns}
                            data={pagedGridData}
                            columnFilters={columnFilters}
                            onColumnFilterChange={handleColumnFilterChange}
                            onRecordSelect={(record) => handleRecordSelect(record)}
                        />

                        <div className="ltr-grid-pagination ltr-grid-pagination-bottom">
                            <div className="ltr-grid-pagination-summary">
                                {pageStart}-{pageEnd} of {totalRows}
                            </div>
                            <div className="ltr-grid-pagination-inline-label">Rows</div>
                            <ComboBox
                                selectedKey={String(pageSize)}
                                options={[
                                    { key: '50', text: '50' },
                                    { key: '100', text: '100' },
                                    { key: '250', text: '250' },
                                    { key: '500', text: '500' },
                                    { key: '1000', text: '1000' }
                                ]}
                                onChange={(_e, opt) => {
                                    const next = Number(opt?.key || 250);
                                    setPageSize(next);
                                    setCurrentPage(1);
                                }}
                                autoComplete="on"
                                useComboBoxAsMenuWidth
                                styles={{ root: { width: 120 } }}
                            />
                            <DefaultButton
                                text="Prev"
                                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                                disabled={currentPage <= 1}
                            />
                            <div className="ltr-grid-pagination-page">Page {currentPage} of {totalPages}</div>
                            <DefaultButton
                                text="Next"
                                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                                disabled={currentPage >= totalPages}
                            />
                        </div>
                    </>
                )}

                {!loading && viewMode === 'FORM' && detailContext && (
                    <DynamicForm
                        formData={detailContext.record}
                        formDefinition={detailContext.definitions}
                        recordTitle={getRecordTitle(detailContext.record, detailContext.entity)}
                        selectedFormId={detailContext.selectedFormId}
                        formOptions={detailContext.forms.map(f => ({ key: f.id, text: f.name }))}
                        onFormChange={handleDetailFormChange}
                        selectedRecordId={detailContext.recordId}
                        relatedDefinitions={detailContext.relatedDefinitions}
                        relatedData={detailContext.relatedData}
                        relatedLoading={detailContext.relatedLoading}
                        onLoadRelated={handleLoadRelated}
                        onOpenRelatedRecord={handleOpenRelatedRecord}
                        onBack={handleBackFromDetail}
                    />
                )}
            </div>
        </div>
    );
};

export default App;
