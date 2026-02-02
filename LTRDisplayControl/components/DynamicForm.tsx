import * as React from 'react';
import { IFormTab } from '../utils/XmlParser';
import { Label } from '@fluentui/react/lib/Label';
import { Pivot, PivotItem } from '@fluentui/react/lib/Pivot';

interface IDynamicFormProps {
    formData: any;
    formDefinition: IFormTab[]; // Parsing returns array of tabs
    onBack: () => void;
}

export const DynamicForm: React.FC<IDynamicFormProps> = (props) => {
    const { formData, formDefinition, onBack } = props;

    if (!formData) return <div>No data selected</div>;

    return (
        <div className="ltr-form-container">
            <div className="ltr-form-header">
                <button onClick={onBack} style={{ marginBottom: '10px', cursor: 'pointer', padding: '5px 10px' }}>
                    &larr; Back to List
                </button>
                <h3>Record Details</h3>
            </div>

            <Pivot>
                {formDefinition.map(tab => (
                    tab.visible && (
                        <PivotItem headerText={tab.label} key={tab.id} itemKey={tab.id}>
                            <div className="ltr-form-tab-content" style={{ marginTop: '15px' }}>
                                {tab.sections.map(section => (
                                    section.visible && (
                                        <div key={section.id} className="ltr-form-section">
                                            {section.label && <div className="ltr-form-section-title">{section.label}</div>}
                                            <div className="ltr-form-rows">
                                                {section.rows.map((row, rIdx) => (
                                                    <div key={rIdx} className="ltr-form-row">
                                                        {row.cells.map(cell => (
                                                            cell.visible && (
                                                                <div key={cell.id} className="ltr-form-cell" style={{ flex: cell.colSpan || 1 }}>
                                                                    <Label className="ltr-field-label">{cell.label}</Label>
                                                                    <div className="ltr-field-value">
                                                                        {/* Display raw value for now. 
                                                                            Formatted values (like lookup names or option set labels)
                                                                            require '@OData.Community.Display.V1.FormattedValue' 
                                                                         */}
                                                                        {formData[cell.fieldName + "@OData.Community.Display.V1.FormattedValue"] || formData[cell.fieldName] || "--"}
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
                        </PivotItem>
                    )
                ))}
            </Pivot>
        </div>
    );
};
