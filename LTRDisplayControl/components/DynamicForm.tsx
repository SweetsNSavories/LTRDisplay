import * as React from 'react';
import { IFormTab } from '../utils/XmlParser';
import { Label } from '@fluentui/react/lib/Label';
import { Pivot, PivotItem } from '@fluentui/react/lib/Pivot';
import { DefaultButton } from '@fluentui/react/lib/Button';
import { TextField } from '@fluentui/react/lib/TextField';
import { IRelatedRelationship, IAuditHistoryItem } from '../services/LtrService';

interface IDynamicFormProps {
    formData: any;
    formDefinition: IFormTab[]; // Parsing returns array of tabs
    onBack: () => void;
    recordTitle: string;
    selectedFormId?: string;
    selectedFormName?: string;
    formOptions: { key: string; text: string }[];
    onFormChange: (formId: string) => void;
    selectedRecordId?: string;
    auditHistory?: IAuditHistoryItem[];
    auditLoading?: boolean;
    relatedDefinitions: IRelatedRelationship[];
    relatedData: Record<string, any[]>;
    relatedLoading: Record<string, boolean>;
    onLoadRelated: (relationship: IRelatedRelationship, forceReload?: boolean) => void;
    onOpenRelatedRecord: (entity: string, id?: string, row?: any) => void;
}

const GUID_REGEX = /^\{?[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\}?$/i;

function resolveRelatedRecordId(row: any, childEntity: string): string | undefined {
    if (!row || typeof row !== 'object') {
        return undefined;
    }

    const direct = row[`${childEntity}id`];
    if (typeof direct === 'string' && GUID_REGEX.test(direct)) {
        return direct.replace(/[{}]/g, '').toLowerCase();
    }

    const key = Object.keys(row).find(k => k.toLowerCase().endsWith('id') && typeof row[k] === 'string' && GUID_REGEX.test(row[k]));
    if (!key) {
        return undefined;
    }

    return row[key].replace(/[{}]/g, '').toLowerCase();
}

function getRelationshipColumns(rows: any[]): string[] {
    if (!rows || rows.length === 0) {
        return [];
    }

    const first = rows[0] || {};
    const keys = Object.keys(first)
        .filter(k => !k.includes('@') && !k.startsWith('odata.') && !k.startsWith('_') && !k.toLowerCase().endsWith('id'))
        .slice(0, 6);

    return keys;
}

function getFieldDisplayValue(record: any, fieldName: string): string {
    if (!record || !fieldName) {
        return "--";
    }

    const formattedKey = `${fieldName}@OData.Community.Display.V1.FormattedValue`;
    const lookupKey = `_${fieldName}_value`;
    const lookupFormattedKey = `${lookupKey}@OData.Community.Display.V1.FormattedValue`;

    const directFormatted = record[formattedKey];
    if (directFormatted !== null && directFormatted !== undefined && String(directFormatted).length > 0) {
        return String(directFormatted);
    }

    const lookupFormatted = record[lookupFormattedKey];
    if (lookupFormatted !== null && lookupFormatted !== undefined && String(lookupFormatted).length > 0) {
        return String(lookupFormatted);
    }

    const directRaw = record[fieldName];
    if (directRaw !== null && directRaw !== undefined && String(directRaw).length > 0) {
        return String(directRaw);
    }

    const lookupRaw = record[lookupKey];
    if (lookupRaw !== null && lookupRaw !== undefined && String(lookupRaw).length > 0) {
        return String(lookupRaw);
    }

    const lower = fieldName.toLowerCase();
    const matchingKey = Object.keys(record).find((k) => {
        const candidate = k.toLowerCase();
        return candidate === lower || candidate === `_${lower}_value`;
    });

    if (matchingKey) {
        const formatted = record[`${matchingKey}@OData.Community.Display.V1.FormattedValue`];
        if (formatted !== null && formatted !== undefined && String(formatted).length > 0) {
            return String(formatted);
        }
        const raw = record[matchingKey];
        if (raw !== null && raw !== undefined && String(raw).length > 0) {
            return String(raw);
        }
    }

    return "--";
}

export const DynamicForm: React.FC<IDynamicFormProps> = (props) => {
    const {
        formData,
        formDefinition,
        onBack,
        selectedFormId,
        selectedFormName,
        formOptions,
        onFormChange,
        selectedRecordId,
        auditHistory,
        auditLoading,
        relatedDefinitions,
        relatedData,
        relatedLoading,
        onLoadRelated,
        onOpenRelatedRecord
    } = props;

    const [selectedRelatedKey, setSelectedRelatedKey] = React.useState<string>();
    const [relatedSearchText, setRelatedSearchText] = React.useState<string>('');

    const filteredRelatedDefinitions = React.useMemo(() => {
        const query = relatedSearchText.trim().toLowerCase();
        if (!query) {
            return relatedDefinitions;
        }

        return relatedDefinitions.filter(r =>
            r.childEntity.toLowerCase().includes(query) ||
            r.schemaName.toLowerCase().includes(query)
        );
    }, [relatedDefinitions, relatedSearchText]);

    React.useEffect(() => {
        if (filteredRelatedDefinitions.length === 0) {
            setSelectedRelatedKey(undefined);
            return;
        }

        if (!selectedRelatedKey || !filteredRelatedDefinitions.some(r => r.key === selectedRelatedKey)) {
            setSelectedRelatedKey(filteredRelatedDefinitions[0].key);
        }
    }, [filteredRelatedDefinitions, selectedRelatedKey]);

    const selectedRelationship = React.useMemo(
        () => filteredRelatedDefinitions.find(r => r.key === selectedRelatedKey),
        [filteredRelatedDefinitions, selectedRelatedKey]
    );

    const selectedRows = selectedRelationship ? (relatedData[selectedRelationship.key] || []) : [];
    const selectedColumns = getRelationshipColumns(selectedRows);

    const selectedFormOption = React.useMemo(() => {
        if (formOptions.length === 0) {
            return undefined;
        }

        if (selectedFormId) {
            const selectedLower = String(selectedFormId).toLowerCase();
            const exact = formOptions.find(f => String(f.key).toLowerCase() === selectedLower);
            if (exact) {
                return exact;
            }
        }

        return formOptions[0];
    }, [formOptions, selectedFormId]);

    const selectedFormLabel = selectedFormOption?.text || selectedFormName || (formOptions.length > 0 ? formOptions[0].text : 'Form');
    const formMenuItems = formOptions.map(f => ({
        key: String(f.key),
        text: f.text,
        canCheck: true,
        checked: String(f.key).toLowerCase() === String(selectedFormOption?.key || '').toLowerCase(),
        onClick: () => onFormChange(String(f.key))
    }));

    const headerFields = React.useMemo(() => {
        const result: { key: string; label: string; value: string }[] = [];
        const seen = new Set<string>();

        for (const tab of formDefinition || []) {
            if (!tab.visible) continue;
            const sections = tab.columns?.flatMap(c => c.sections || []) || tab.sections || [];

            for (const section of sections) {
                if (!section.visible) continue;

                for (const row of section.rows || []) {
                    for (const cell of row.cells || []) {
                        if (!cell.visible || !cell.fieldName) continue;
                        const key = cell.fieldName.toLowerCase();
                        if (seen.has(key)) continue;

                        const value = getFieldDisplayValue(formData, cell.fieldName);
                        seen.add(key);

                        result.push({
                            key,
                            label: cell.label || cell.fieldName,
                            value
                        });

                        if (result.length >= 4) {
                            return result;
                        }
                    }
                }
            }
        }

        return result;
    }, [formDefinition, formData]);

    const fieldLabelMap = React.useMemo(() => {
        const labels = new Map<string, string>();
        for (const tab of formDefinition || []) {
            const sections = tab.columns?.flatMap(c => c.sections || []) || tab.sections || [];
            for (const section of sections || []) {
                for (const row of section.rows || []) {
                    for (const cell of row.cells || []) {
                        if (!cell?.fieldName) continue;
                        const key = String(cell.fieldName).toLowerCase();
                        const normalized = key.replace(/^_/, '').replace(/_value$/, '');
                        const label = cell.label || cell.fieldName;
                        if (!labels.has(key)) {
                            labels.set(key, label);
                        }
                        if (!labels.has(normalized)) {
                            labels.set(normalized, label);
                        }
                    }
                }
            }
        }
        return labels;
    }, [formDefinition]);

    const recordDataRows = React.useMemo(() => {
        if (!formData || typeof formData !== 'object') {
            return [] as { key: string; label: string; value: string }[];
        }

        const ignoredPrefixes = ['odata.'];
        const rows: { key: string; label: string; value: string }[] = [];

        for (const key of Object.keys(formData)) {
            if (!key) continue;
            if (key.includes('@')) continue;
            if (ignoredPrefixes.some(prefix => key.toLowerCase().startsWith(prefix))) continue;

            const raw = formData[key];
            if (raw === null || raw === undefined || raw === '') continue;

            const formatted = formData[`${key}@OData.Community.Display.V1.FormattedValue`];
            const value = formatted !== null && formatted !== undefined && String(formatted).length > 0
                ? String(formatted)
                : String(raw);

            const normalized = key.toLowerCase().replace(/^_/, '').replace(/_value$/, '');
            const label = fieldLabelMap.get(key.toLowerCase()) || fieldLabelMap.get(normalized) || key;

            rows.push({ key, label, value });
        }

        return rows.sort((a, b) => a.label.localeCompare(b.label));
    }, [formData, fieldLabelMap]);

    const auditRows = React.useMemo(() => {
        if (!auditHistory || auditHistory.length === 0) {
            return [] as { item: IAuditHistoryItem; showEventColumns: boolean }[];
        }

        let previousEventKey = '';
        return auditHistory.map((item) => {
            const eventKey = item.eventKey || `${item.createdOn || ''}|${item.changedBy || ''}|${item.operation || ''}|${item.action || ''}`;
            const showEventColumns = eventKey !== previousEventKey;
            previousEventKey = eventKey;
            return { item, showEventColumns };
        });
    }, [auditHistory]);

    if (!formData) return <div>No data selected</div>;
    if (!formDefinition || formDefinition.length === 0) {
        return (
            <div className="ltr-form-container">
                <div className="ltr-form-header">
                    <button className="ltr-back-button" aria-label="Back" title="Back" onClick={onBack}>
                        &larr;
                    </button>
                    <div className="ltr-form-title-row">
                        <span className="ltr-form-selected-form">{selectedFormLabel}</span>
                        <DefaultButton
                            className="ltr-form-switch-button"
                            text=""
                            menuIconProps={{ iconName: 'ChevronDown' }}
                            title="Select form"
                            ariaLabel="Select form"
                            disabled={formMenuItems.length === 0}
                            menuProps={{ items: formMenuItems }}
                        />
                    </div>
                </div>
                {headerFields.length > 0 && (
                    <div className="ltr-form-header-fields">
                        {headerFields.map(field => (
                            <div key={field.key} className="ltr-form-header-field">
                                <span className="ltr-form-header-field-label">{field.label}:</span>
                                <span className="ltr-form-header-field-value">{field.value}</span>
                            </div>
                        ))}
                    </div>
                )}
                <div>No main form metadata available for the selected entity.</div>
            </div>
        );
    }

    return (
        <div className="ltr-form-container">
            <div className="ltr-form-header">
                <button className="ltr-back-button" aria-label="Back" title="Back" onClick={onBack}>
                    &larr;
                </button>
                <div className="ltr-form-title-row">
                    <span className="ltr-form-selected-form">{selectedFormLabel}</span>
                    <DefaultButton
                        className="ltr-form-switch-button"
                        text=""
                        menuIconProps={{ iconName: 'ChevronDown' }}
                        title="Select form"
                        ariaLabel="Select form"
                        disabled={formMenuItems.length === 0}
                        menuProps={{ items: formMenuItems }}
                    />
                </div>
            </div>
            {headerFields.length > 0 && (
                <div className="ltr-form-header-fields">
                    {headerFields.map(field => (
                        <div key={field.key} className="ltr-form-header-field">
                            <span className="ltr-form-header-field-label">{field.label}:</span>
                            <span className="ltr-form-header-field-value">{field.value}</span>
                        </div>
                    ))}
                </div>
            )}

            <Pivot>
                {formDefinition.map(tab => (
                    tab.visible && (
                        <PivotItem headerText={tab.label} key={tab.id} itemKey={tab.id}>
                            <div className="ltr-form-tab-content" style={{ marginTop: '15px' }}>
                                <div
                                    className="ltr-form-tab-grid"
                                    style={{
                                        gridTemplateColumns: `repeat(${Math.max(tab.columns?.length || 1, 1)}, minmax(0, 1fr))`
                                    }}
                                >
                                    {(tab.columns && tab.columns.length > 0 ? tab.columns : [{ id: `${tab.id}_single`, sections: tab.sections } as any]).map((column: any) => (
                                        <div key={column.id} className="ltr-form-tab-column">
                                            {(column.sections || []).map((section: any) => (
                                                section.visible && (
                                                    <div key={section.id} className="ltr-form-section">
                                                        {section.label && <div className="ltr-form-section-title">{section.label}</div>}
                                                        <div className="ltr-form-rows">
                                                            {section.rows.map((row: any, rIdx: number) => (
                                                                <div key={rIdx} className="ltr-form-row">
                                                                    {row.cells.map((cell: any) => (
                                                                        cell.visible && (
                                                                            <div key={cell.id} className="ltr-form-cell" style={{ flex: cell.colSpan || 1 }}>
                                                                                <Label className="ltr-field-label">{cell.label}</Label>
                                                                                <div className="ltr-field-value">
                                                                                    {getFieldDisplayValue(formData, cell.fieldName)}
                                                                                </div>
                                                                            </div>
                                                                        )
                                                                    ))}
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </div>
                                                )
                                            ))}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </PivotItem>
                    )
                ))}
                <PivotItem headerText="Record Data" itemKey="recordData">
                    <div className="ltr-record-data-tab">
                        {recordDataRows.length === 0 && <div>No non-null fields found in the current record payload.</div>}
                        {recordDataRows.length > 0 && (
                            <table className="ltr-record-data-table">
                                <thead>
                                    <tr>
                                        <th>Field</th>
                                        <th>Value</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {recordDataRows.map(row => (
                                        <tr key={row.key}>
                                            <td>{row.label}</td>
                                            <td>{row.value}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}
                    </div>
                </PivotItem>
                <PivotItem headerText="Audit History" itemKey="auditHistory">
                    <div className="ltr-record-data-tab">
                        {auditLoading && <div>Loading audit history...</div>}
                        {!auditLoading && (!auditHistory || auditHistory.length === 0) && <div>No audit history found.</div>}
                        {!auditLoading && !!auditHistory && auditHistory.length > 0 && (
                            <table className="ltr-record-data-table">
                                <thead>
                                    <tr>
                                        <th>Changed On</th>
                                        <th>Changed By</th>
                                        <th>Operation</th>
                                        <th>Action</th>
                                        <th>Attribute</th>
                                        <th>Old Value</th>
                                        <th>New Value</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {auditRows.map(({ item, showEventColumns }) => (
                                        <tr key={item.id} className={showEventColumns ? 'ltr-audit-group-start' : ''}>
                                            <td>{showEventColumns ? (item.createdOn ? new Date(item.createdOn).toLocaleString() : '--') : ''}</td>
                                            <td>{showEventColumns ? (item.changedBy || '--') : ''}</td>
                                            <td>{showEventColumns ? (item.operation || '--') : ''}</td>
                                            <td>{showEventColumns ? (item.action || '--') : ''}</td>
                                            <td>{item.attribute || '--'}</td>
                                            <td>{item.oldValue || '--'}</td>
                                            <td>{item.newValue || '--'}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}
                    </div>
                </PivotItem>
                <PivotItem headerText="Related" itemKey="related">
                    <div className="ltr-related-tab">
                        <div className="ltr-related-list">
                            <div className="ltr-related-search-wrap">
                                <TextField
                                    placeholder="Search related tables"
                                    value={relatedSearchText}
                                    onChange={(_e, value) => setRelatedSearchText(value || '')}
                                />
                            </div>
                            {filteredRelatedDefinitions.map(relationship => (
                                <button
                                    key={relationship.key}
                                    className={`ltr-related-item ${selectedRelatedKey === relationship.key ? 'active' : ''}`}
                                    onClick={() => setSelectedRelatedKey(relationship.key)}
                                >
                                    {relationship.childEntity} ({relationship.schemaName})
                                </button>
                            ))}
                            {relatedDefinitions.length === 0 && <div style={{ padding: 12 }}>No one-to-many relationships found.</div>}
                            {relatedDefinitions.length > 0 && filteredRelatedDefinitions.length === 0 && <div style={{ padding: 12 }}>No related tables match search.</div>}
                        </div>

                        <div className="ltr-related-grid-wrap">
                            <div className="ltr-related-grid-header">
                                <strong>
                                    {selectedRelationship
                                        ? `${selectedRelationship.childEntity} via ${selectedRelationship.childLookupAttribute}`
                                        : 'Related'}
                                </strong>
                                <DefaultButton
                                    text={selectedRelationship && relatedData[selectedRelationship.key] ? "Reload" : "Load"}
                                    onClick={() => selectedRelationship && onLoadRelated(selectedRelationship, true)}
                                    disabled={!selectedRecordId || !selectedRelationship || !!relatedLoading[selectedRelationship.key]}
                                />
                            </div>

                            {selectedRelationship && relatedLoading[selectedRelationship.key] && <div>Loading...</div>}
                            {selectedRelationship && !relatedLoading[selectedRelationship.key] && !relatedData[selectedRelationship.key] && <div>Not loaded.</div>}
                            {selectedRelationship && !relatedLoading[selectedRelationship.key] && selectedRows.length === 0 && <div>No related records.</div>}
                            {!selectedRelationship && <div>Select a relationship.</div>}

                            {selectedRelationship && !relatedLoading[selectedRelationship.key] && selectedRows.length > 0 && (
                                <table className="ltr-related-grid-table">
                                    <thead>
                                        <tr>
                                            {selectedColumns.map(field => (
                                                <th key={field}>{field}</th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {selectedRows.map((row: any, idx: number) => {
                                            const id = resolveRelatedRecordId(row, selectedRelationship.childEntity);
                                            return (
                                                <tr
                                                    key={id || idx}
                                                    onClick={() => onOpenRelatedRecord(selectedRelationship.childEntity, id, row)}
                                                    className="ltr-related-grid-row"
                                                >
                                                    {selectedColumns.map(field => (
                                                        <td key={field}>
                                                            {row[`${field}@OData.Community.Display.V1.FormattedValue`] || row[field] || "--"}
                                                        </td>
                                                    ))}
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            )}
                        </div>
                    </div>
                </PivotItem>
            </Pivot>
        </div>
    );
};
