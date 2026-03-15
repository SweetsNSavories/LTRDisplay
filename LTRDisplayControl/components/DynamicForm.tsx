import * as React from 'react';
import { IFormTab } from '../utils/XmlParser';
import { Label } from '@fluentui/react/lib/Label';
import { Pivot, PivotItem } from '@fluentui/react/lib/Pivot';
import { Dropdown } from '@fluentui/react/lib/Dropdown';
import { DefaultButton } from '@fluentui/react/lib/Button';
import { IRelatedRelationship } from '../services/LtrService';

interface IDynamicFormProps {
    formData: any;
    formDefinition: IFormTab[]; // Parsing returns array of tabs
    onBack: () => void;
    recordTitle: string;
    selectedFormId?: string;
    formOptions: { key: string; text: string }[];
    onFormChange: (formId: string) => void;
    selectedRecordId?: string;
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
        recordTitle,
        selectedFormId,
        formOptions,
        onFormChange,
        selectedRecordId,
        relatedDefinitions,
        relatedData,
        relatedLoading,
        onLoadRelated,
        onOpenRelatedRecord
    } = props;

    const [selectedRelatedKey, setSelectedRelatedKey] = React.useState<string>();

    React.useEffect(() => {
        if (relatedDefinitions.length === 0) {
            setSelectedRelatedKey(undefined);
            return;
        }

        if (!selectedRelatedKey || !relatedDefinitions.some(r => r.key === selectedRelatedKey)) {
            setSelectedRelatedKey(relatedDefinitions[0].key);
        }
    }, [relatedDefinitions, selectedRelatedKey]);

    const selectedRelationship = React.useMemo(
        () => relatedDefinitions.find(r => r.key === selectedRelatedKey),
        [relatedDefinitions, selectedRelatedKey]
    );

    const selectedRows = selectedRelationship ? (relatedData[selectedRelationship.key] || []) : [];
    const selectedColumns = getRelationshipColumns(selectedRows);

    const ownerDisplay =
        formData?.["ownerid@OData.Community.Display.V1.FormattedValue"] ||
        formData?.ownerid?.name ||
        formData?.ownerid ||
        "--";

    if (!formData) return <div>No data selected</div>;
    if (!formDefinition || formDefinition.length === 0) {
        return (
            <div className="ltr-form-container">
                <div className="ltr-form-header">
                    <button className="ltr-back-button" aria-label="Back" title="Back" onClick={onBack}>
                        &larr;
                    </button>
                    <div className="ltr-form-title-row">
                        <div className="ltr-form-record-title">{recordTitle}</div>
                        <span className="ltr-form-title-sep">:</span>
                        <Dropdown
                            selectedKey={selectedFormId}
                            options={formOptions}
                            onChange={(_e, opt) => opt && onFormChange(opt.key as string)}
                            styles={{ root: { width: 340, marginBottom: 0 } }}
                        />
                    </div>
                    <div className="ltr-form-owner">Owner: {ownerDisplay}</div>
                </div>
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
                    <div className="ltr-form-record-title">{recordTitle}</div>
                    <span className="ltr-form-title-sep">:</span>
                    <Dropdown
                        selectedKey={selectedFormId}
                        options={formOptions}
                        onChange={(_e, opt) => opt && onFormChange(opt.key as string)}
                        styles={{ root: { width: 340, marginBottom: 0 } }}
                    />
                </div>
                <div className="ltr-form-owner">Owner: {ownerDisplay}</div>
            </div>

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
                <PivotItem headerText="Related" itemKey="related">
                    <div className="ltr-related-tab">
                        <div className="ltr-related-list">
                            {relatedDefinitions.map(relationship => (
                                <button
                                    key={relationship.key}
                                    className={`ltr-related-item ${selectedRelatedKey === relationship.key ? 'active' : ''}`}
                                    onClick={() => setSelectedRelatedKey(relationship.key)}
                                >
                                    {relationship.childEntity} ({relationship.schemaName})
                                </button>
                            ))}
                            {relatedDefinitions.length === 0 && <div style={{ padding: 12 }}>No one-to-many relationships found.</div>}
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
