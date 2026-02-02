import * as React from 'react';
import { DetailsList, IColumn, SelectionMode, Selection, DetailsListLayoutMode } from '@fluentui/react/lib/DetailsList';
import { IGridColumn } from '../utils/XmlParser';

interface IDynamicGridProps {
    columns: IGridColumn[];
    data: any[];
    onRecordSelect: (recordId: string) => void;
}

export const DynamicGrid: React.FC<IDynamicGridProps> = (props) => {
    const { columns, data, onRecordSelect } = props;

    const _selection = new Selection({
        onSelectionChanged: () => {
            const selected = _selection.getSelection();
            if (selected.length > 0) {
                const item = selected[0] as any;
                // Assuming entity logical name is standard, the ID field is usually entityid but we need to know the primary key
                // For simplified PCF usage, we often grab the first GUID-like field or pass primary key name
                // Here we will try to find a field ending in 'id' or use a strict contract
                // For now, let's assume the data object has an 'id' property or similar mapped by the service
                // PRO TIP: The WebAPI response usually has entityid as the primary key property, e.g. 'incidentid'
                // effectively we pass the whole object back or just the ID if we can guess it.
                // Let's pass the whole item and let App handle extraction or guess the ID.
                const possibleId = item.id || item.incidentid; // Fallback for specific case, will refine
                if (possibleId) onRecordSelect(possibleId);
            }
        }
    });

    const gridColumns: IColumn[] = columns.map(c => ({
        key: c.name,
        name: c.displayName || c.name,
        fieldName: c.name,
        minWidth: c.width,
        maxWidth: c.width * 2,
        isResizable: true
    }));

    return (
        <div className="ltr-grid-container">
            <DetailsList
                items={data}
                columns={gridColumns}
                selectionMode={SelectionMode.single}
                selection={_selection}
                layoutMode={DetailsListLayoutMode.justified}
                isHeaderVisible={true}
            />
        </div>
    );
};
