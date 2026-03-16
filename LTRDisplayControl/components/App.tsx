import * as React from 'react';
import { IInputs } from "../generated/ManifestTypes";
import { LtrService, IViewDefinition, IFormDefinition, IRelatedRelationship, ISearchableAttribute } from '../services/LtrService';
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

interface ISearchColumnOption {
    logicalName: string;
    displayName?: string;
    attributeType: string;
}

interface IDetailContext {
    entity: string;
    record: any;
    recordId?: string;
    forms: IFormDefinition[];
    selectedFormId?: string;
    selectedFormName?: string;
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
    records: Record<string, Record<string, any>>;
}

interface ILtrBrowserCache {
    byUser: Record<string, IUserCache>;
}

const GUID_REGEX = /^\{?[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\}?$/i;

function getUserPersistentCacheKey(userId: string): string {
    return `__ltrDisplayCache.user.${userId}`;
}

function readUserCacheFromStorage(userId: string): IUserCache | undefined {
    try {
        const key = getUserPersistentCacheKey(userId);
        const raw = window.localStorage.getItem(key) || window.sessionStorage.getItem(key);
        if (!raw) {
            return undefined;
        }

        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== 'object') {
            return undefined;
        }

        return {
            views: parsed.views || {},
            related: parsed.related || {},
            forms: parsed.forms || {},
            relationships: parsed.relationships || {},
            records: parsed.records || {}
        } as IUserCache;
    } catch {
        return undefined;
    }
}

function writeUserCacheToStorage(userId: string, cache: IUserCache): void {
    const serialized = JSON.stringify(cache);
    const key = getUserPersistentCacheKey(userId);

    try {
        window.localStorage.setItem(key, serialized);
        return;
    } catch {
        // fall through
    }

    try {
        window.sessionStorage.setItem(key, serialized);
    } catch {
        // Ignore storage quota/security failures.
    }
}

function getBrowserCache(userId: string): IUserCache {
    const key = '__ltrDisplayCache';
    const globalObj = window as any;
    const root: ILtrBrowserCache = globalObj[key] || { byUser: {} };
    if (!root.byUser[userId]) {
        const restored = readUserCacheFromStorage(userId);
        root.byUser[userId] = restored || { views: {}, related: {}, forms: {}, relationships: {}, records: {} };
    }
    if (!root.byUser[userId].records) {
        root.byUser[userId].records = {};
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
    return `main-only-v2|${entity.toLowerCase()}`;
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

function getRecordIdCandidates(record: any, entity: string): string[] {
    if (!record || typeof record !== 'object') {
        return [];
    }

    const primaryIdKey = `${entity}id`;
    const rawCandidates: string[] = [];

    if (typeof record[primaryIdKey] === 'string') {
        rawCandidates.push(record[primaryIdKey]);
    }

    if (typeof record.id === 'string') {
        rawCandidates.push(record.id);
    }

    Object.keys(record).forEach((k) => {
        const value = record[k];
        if (typeof value === 'string' && (k.toLowerCase().endsWith('id') || /^_.*_value$/i.test(k))) {
            rawCandidates.push(value);
        }
    });

    const seen = new Set<string>();
    const normalized: string[] = [];
    for (const candidate of rawCandidates) {
        if (!GUID_REGEX.test(candidate)) {
            continue;
        }

        const id = normalizeGuid(candidate);
        if (!id || seen.has(id)) {
            continue;
        }

        seen.add(id);
        normalized.push(id);
    }

    return normalized;
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

function upsertRecordsInCache(cache: IUserCache, entity: string, rows: any[]): void {
    const logical = (entity || '').toLowerCase();
    if (!logical || !Array.isArray(rows) || rows.length === 0) {
        return;
    }

    if (!cache.records[logical]) {
        cache.records[logical] = {};
    }

    rows.forEach((row) => {
        const id = resolveRecordId(row, logical);
        if (!id) {
            return;
        }

        const existing = cache.records[logical][id] || {};
        cache.records[logical][id] = { ...existing, ...row };
    });
}

function getRecordFromCache(cache: IUserCache, entity: string, id?: string): Record<string, unknown> | undefined {
    const logical = (entity || '').toLowerCase();
    const normalizedId = normalizeGuid(id);
    if (!logical || !normalizedId) {
        return undefined;
    }

    return cache.records[logical]?.[normalizedId];
}

function escapeXml(value: string): string {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}

function splitSearchTokens(text?: string): string[] {
    return (text || '')
        .split(',')
        .map(v => v.trim())
        .filter(Boolean);
}

function isContainsSearchType(attributeType?: string): boolean {
    const t = (attributeType || '').toLowerCase();
    return (
        t.includes('string') ||
        t.includes('memo') ||
        t.includes('entityname') ||
        t.includes('virtual')
    );
}

function normalizeTokenForType(token: string, attributeType?: string): string {
    const t = (attributeType || '').toLowerCase();
    const value = token.trim();

    if (!value) {
        return value;
    }

    if (t.includes('uniqueidentifier') || t.includes('lookup') || t.includes('customer') || t.includes('owner')) {
        return value.replace(/[{}]/g, '').toLowerCase();
    }

    if (t.includes('boolean')) {
        const normalized = value.toLowerCase();
        if (['true', '1', 'yes', 'y'].includes(normalized)) return '1';
        if (['false', '0', 'no', 'n'].includes(normalized)) return '0';
    }

    return value;
}

function appendInitialFetchClause(fetchXml: string, column?: string, text?: string, attributeType?: string): string {
    const attr = (column || '').trim();
    const query = (text || '').trim();
    const tokens = splitSearchTokens(query);

    if (!attr || !query || tokens.length === 0) {
        return fetchXml;
    }

    const useContains = isContainsSearchType(attributeType);
    let conditionXml = '';

    if (tokens.length > 1) {
        const values = tokens
            .map(v => normalizeTokenForType(v, attributeType))
            .filter(Boolean)
            .map(v => `<value>${escapeXml(v)}</value>`)
            .join('');
        conditionXml = `<condition attribute="${escapeXml(attr)}" operator="in">${values}</condition>`;
    } else {
        const value = normalizeTokenForType(tokens[0], attributeType);
        if (useContains) {
            conditionXml = `<condition attribute="${escapeXml(attr)}" operator="like" value="%${escapeXml(value)}%" />`;
        } else {
            conditionXml = `<condition attribute="${escapeXml(attr)}" operator="eq" value="${escapeXml(value)}" />`;
        }
    }

    const condition = `<filter type="and">${conditionXml}</filter>`;
    const idx = fetchXml.lastIndexOf('</entity>');
    if (idx < 0) {
        return fetchXml;
    }

    return `${fetchXml.slice(0, idx)}${condition}${fetchXml.slice(idx)}`;
}

function applySearchClauseLocally(rows: any[], column?: string, text?: string, attributeType?: string): any[] {
    const attr = (column || '').trim();
    const tokens = splitSearchTokens(text);
    if (!attr || tokens.length === 0) {
        return rows;
    }

    const containsMode = isContainsSearchType(attributeType);
    const normalizedTokens = tokens
        .map(token => normalizeTokenForType(token, attributeType).toLowerCase())
        .filter(Boolean);

    if (normalizedTokens.length === 0) {
        return rows;
    }

    const isInMode = normalizedTokens.length > 1;

    return rows.filter((row) => {
        const formatted = row?.[`${attr}@OData.Community.Display.V1.FormattedValue`];
        const raw = formatted ?? row?.[attr];
        if (raw === null || raw === undefined) {
            return false;
        }

        const normalizedRaw = normalizeTokenForType(String(raw), attributeType).toLowerCase();
        if (!normalizedRaw) {
            return false;
        }

        if (isInMode) {
            return normalizedTokens.includes(normalizedRaw);
        }

        if (containsMode) {
            return normalizedRaw.includes(normalizedTokens[0]);
        }

        return normalizedRaw === normalizedTokens[0];
    });
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
    const [searchColumns, setSearchColumns] = React.useState<ISearchColumnOption[]>([]);
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

    const persistCurrentUserCache = React.useCallback((cache: IUserCache) => {
        const userId = normalizeGuid(context.userSettings.userId) || 'anonymous';
        writeUserCacheToStorage(userId, cache);
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
        persistCurrentUserCache(cache);
        return forms;
    }, [getCurrentUserCache, persistCurrentUserCache]);

    const loadRelationshipsForEntity = React.useCallback(async (entity: string): Promise<IRelatedRelationship[]> => {
        const cache = getCurrentUserCache();
        const key = getRelationshipsCacheKey(entity);
        if (cache.relationships[key]) {
            return cache.relationships[key];
        }

        const service = new LtrService(context, entity);
        const relationships = await service.getOneToManyRelationships();
        cache.relationships[key] = relationships;
        persistCurrentUserCache(cache);
        return relationships;
    }, [getCurrentUserCache, persistCurrentUserCache]);

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
    }, [targetEntity, props.ltrEntities]);

    const prepareView = React.useCallback((viewId: string, currentViews: IViewDefinition[]) => {
        setSelectedViewId(viewId);
        const view = currentViews.find(v => v.id === viewId);
        if (!view) {
            diag.error("Selected view not found", null, { viewId });
            setGridColumns([]);
            setGridData([]);
            return;
        }

        const columns = XmlParserHelper.parseLayoutXml(view.layoutXml);
        setGridColumns(columns);
        setColumnFilters({});
        setCurrentPage(1);
        setGridData([]);
    }, []);

    const handleViewChange = async (
        viewId: string,
        currentViews = views,
        forceServerRefresh: boolean = false,
        cacheOnly: boolean = false
    ) => {
        setLoading(true);
        try {
            const view = currentViews.find(v => v.id === viewId);
            if (!view) return;

            if (selectedViewId !== viewId) {
                const columns = XmlParserHelper.parseLayoutXml(view.layoutXml);
                setSelectedViewId(viewId);
                setGridColumns(columns);
            }

            const userId = normalizeGuid(context.userSettings.userId) || 'anonymous';
            const userCache = getBrowserCache(userId);
            const selectedSearchColumn = searchColumns.find(c => c.logicalName === searchColumn);
            const effectiveFetchXml = appendInitialFetchClause(view.fetchXml, searchColumn, searchText, selectedSearchColumn?.attributeType);
            const normalizedSearchText = (searchText || '').trim().toLowerCase();
            const hasSearchClause = !!(searchColumn && normalizedSearchText);
            const clauseKey = hasSearchClause ? `${searchColumn}|${normalizedSearchText}` : '__nosearch__';
            const cacheKey = `${getViewCacheKey(selectedEntity, viewId, archiveMode)}|${clauseKey}`;
            const cached = userCache.views[cacheKey];

            if (cacheOnly) {
                if (cached) {
                    setGridData(cached);
                    diag.info("Grid data loaded from cache only", { cacheKey, count: cached.length });
                } else {
                    const viewKeyPrefix = `${getViewCacheKey(selectedEntity, viewId, archiveMode)}|`;
                    const noSearchKey = `${viewKeyPrefix}__nosearch__`;
                    const noSearchRows = userCache.views[noSearchKey];
                    const candidateKeys = Object.keys(userCache.views).filter(k => k.startsWith(viewKeyPrefix));
                    const fallbackKey = noSearchRows
                        ? noSearchKey
                        : (candidateKeys.length > 0 ? candidateKeys[candidateKeys.length - 1] : undefined);
                    const fallbackRows = fallbackKey ? userCache.views[fallbackKey] : undefined;

                    if (fallbackRows) {
                        const locallyFiltered = hasSearchClause
                            ? applySearchClauseLocally(fallbackRows, searchColumn, searchText, selectedSearchColumn?.attributeType)
                            : fallbackRows;
                        setGridData(locallyFiltered);
                        diag.info("Grid data loaded from fallback cache key", {
                            requestedCacheKey: cacheKey,
                            fallbackKey,
                            sourceCount: fallbackRows.length,
                            count: locallyFiltered.length,
                            hasSearchClause
                        });
                    } else {
                        setGridData([]);
                        diag.info("No cached data found for selected view", { cacheKey, viewKeyPrefix });
                    }
                }
                return;
            }

            if (forceServerRefresh) {
                diag.info("Apply Fetch Clause requested: fetching server data", { cacheKey });
            }

            const data = await ltrService.getLtrData(effectiveFetchXml, archiveMode);
            userCache.views[cacheKey] = data;
            upsertRecordsInCache(userCache, selectedEntity, data);
            persistCurrentUserCache(userCache);
            diag.info("View data fetched and cached", { cacheKey, count: data.length });
            setGridData(userCache.views[cacheKey] || []);
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
                const searchable = await service.getSearchableAttributes(selectedEntity);

                setViews(vs);
                setDetailsForms(fs);
                const searchOptions: ISearchColumnOption[] = searchable.map((a: ISearchableAttribute) => ({
                    logicalName: a.logicalName,
                    displayName: a.displayName,
                    attributeType: a.attributeType
                }));
                setSearchColumns(searchOptions);
                setSearchColumn(prev => (
                    prev && searchOptions.some(c => c.logicalName === prev)
                        ? prev
                        : searchOptions[0]?.logicalName
                ));

                if (vs.length > 0) {
                    prepareView(vs[0].id, vs);
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
    }, [selectedEntity, archiveMode, loadFormsForEntity, prepareView]);

    const handleRecordSelect = async (recordRef: any) => {
        try {
            const incomingRecord = typeof recordRef === 'object' && recordRef ? recordRef : null;
            const explicitId = typeof recordRef === 'string' ? normalizeGuid(recordRef) : undefined;
            const fallbackId = typeof recordRef === 'string' ? undefined : resolveRecordId(recordRef, selectedEntity);
            const idCandidates = explicitId
                ? [explicitId]
                : getRecordIdCandidates(recordRef, selectedEntity);
            if (!explicitId && fallbackId && !idCandidates.includes(fallbackId)) {
                idCandidates.unshift(fallbackId);
            }
            const id = idCandidates[0];

            let record = incomingRecord || undefined;
            if (!record && id) {
                record = gridData.find(r => resolveRecordId(r, selectedEntity) === id);
            }

            const userCache = getCurrentUserCache();
            if (record) {
                upsertRecordsInCache(userCache, selectedEntity, [record]);
                persistCurrentUserCache(userCache);
            }

            if (idCandidates.length > 0) {
                const cachedRecord = idCandidates
                    .map(candidateId => getRecordFromCache(userCache, selectedEntity, candidateId))
                    .find(Boolean);
                if (cachedRecord) {
                    record = record ? { ...record, ...cachedRecord } : cachedRecord;
                }
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
                selectedFormName: rootForm?.name,
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
        if (detailContext.entity === selectedEntity) {
            setSelectedFormId(formId);
        }
        const parsed = XmlParserHelper.parseFormXml(form.formXml);
        setDetailContext({
            ...detailContext,
            selectedFormId: formId,
            selectedFormName: form.name,
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
            upsertRecordsInCache(userCache, relationship.childEntity, rows);
            persistCurrentUserCache(userCache);
            const cachedRows = userCache.related[cacheKey] || [];
            setDetailContext(prev => prev ? {
                ...prev,
                relatedData: { ...prev.relatedData, [relationship.key]: cachedRows }
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
        const idCandidates = normalizedId
            ? [normalizedId]
            : getRecordIdCandidates(row, entity);
        let record = row;

        const userCache = getCurrentUserCache();
        if (record) {
            upsertRecordsInCache(userCache, entity, [record]);
            persistCurrentUserCache(userCache);
        }

        if (idCandidates.length > 0) {
            const cachedRecord = idCandidates
                .map(candidateId => getRecordFromCache(userCache, entity, candidateId))
                .find(Boolean);
            if (cachedRecord) {
                record = record ? { ...record, ...cachedRecord } : cachedRecord;
            }
        }

        if (!record) {
            diag.error("Unable to open related record from cache", null, { entity, id });
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
            recordId: idCandidates[0] || resolveRecordId(record, entity),
            forms,
            selectedFormId: selected?.id,
            selectedFormName: selected?.name,
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
        setSearchColumns([]);
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
                            const nextViewId = opt.key as string;
                            prepareView(nextViewId, views);
                            // On view switch, show cached rows for the selected view immediately.
                            void handleViewChange(nextViewId, views, false, true);
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
                    options={searchColumns.map(c => ({
                        key: c.logicalName,
                        text: c.displayName ? `${c.displayName} (${c.logicalName})` : c.logicalName
                    }))}
                    onChange={(_e, opt) => setSearchColumn(opt?.key as string)}
                    autoComplete="on"
                    useComboBoxAsMenuWidth
                    disabled={loading || searchColumns.length === 0 || viewMode !== 'GRID'}
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
                    onClick={() => {
                        if (selectedViewId) {
                            handleViewChange(selectedViewId, views, true);
                        }
                    }}
                    disabled={loading || !selectedViewId || viewMode !== 'GRID'}
                    styles={{ root: { alignSelf: 'flex-end' } }}
                />

                <DefaultButton
                    text="Show Cached Data"
                    onClick={() => {
                        if (selectedViewId) {
                            handleViewChange(selectedViewId, views, false, true);
                        }
                    }}
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
                        selectedFormName={detailContext.selectedFormName}
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
