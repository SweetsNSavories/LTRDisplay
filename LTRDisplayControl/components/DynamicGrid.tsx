import * as React from 'react';
import { DetailsList, IColumn, SelectionMode, Selection, DetailsListLayoutMode } from '@fluentui/react/lib/DetailsList';
import { IGridColumn } from '../utils/XmlParser';
import { diag } from '../utils/Diagnostics';

interface IDynamicGridProps {
    columns: IGridColumn[];
    data: any[];
    onRecordSelect: (recordId: string) => void;
}

export const DynamicGrid: React.FC<IDynamicGridProps> = (props) => {
    const { columns, data, onRecordSelect } = props;

    const findRecordId = (item: any): string | null => {
        if (!item || typeof item !== 'object') return null;

        const keys = Object.keys(item);
        const direct = keys.find(k => /id$/i.test(k) && typeof item[k] === 'string' && /^[0-9a-fA-F-]{36}$/.test(item[k]));
        if (direct) return item[direct];

        return null;
    };

    const _selection = new Selection({
        onSelectionChanged: () => {
            const selected = _selection.getSelection();
            if (selected.length > 0) {
                const item = selected[0] as any;
                const possibleId = findRecordId(item);
                if (possibleId) {
                    diag.info("Grid row selected", { possibleId });
                    onRecordSelect(possibleId);
                } else {
                    diag.error("Grid selection missing id", null, { itemSample: Object.keys(item) });
                }
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
