import * as React from 'react';
import { DetailsList, IColumn, SelectionMode, Selection, DetailsListLayoutMode } from '@fluentui/react/lib/DetailsList';
import { TextField } from '@fluentui/react/lib/TextField';
import { IconButton, PrimaryButton, DefaultButton } from '@fluentui/react/lib/Button';
import { Callout, DirectionalHint } from '@fluentui/react/lib/Callout';
import { IGridColumn } from '../utils/XmlParser';
import { diag } from '../utils/Diagnostics';

interface IDynamicGridProps {
    columns: IGridColumn[];
    data: any[];
    columnFilters: Record<string, string>;
    onColumnFilterChange: (columnName: string, value: string) => void;
    onRecordSelect: (record: any) => void;
}

const GUID_REGEX = /^\{?[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\}?$/i;

function resolveRecordId(item: any): string | undefined {
    if (!item || typeof item !== 'object') {
        return undefined;
    }

    if (typeof item.id === 'string' && GUID_REGEX.test(item.id)) {
        return item.id.replace(/[{}]/g, '').toLowerCase();
    }

    const keys = Object.keys(item);
    const primaryKey = keys.find(k => k.toLowerCase().endsWith('id') && typeof item[k] === 'string' && GUID_REGEX.test(item[k]));
    if (primaryKey) {
        return item[primaryKey].replace(/[{}]/g, '').toLowerCase();
    }

    return undefined;
}

export const DynamicGrid: React.FC<IDynamicGridProps> = (props) => {
    const { columns, data, columnFilters, onColumnFilterChange, onRecordSelect } = props;
    const [activeFilterColumn, setActiveFilterColumn] = React.useState<string>();
    const [filterDraft, setFilterDraft] = React.useState<string>('');
    const [filterAnchor, setFilterAnchor] = React.useState<HTMLElement>();

    const _selection = new Selection({
        onSelectionChanged: () => {
            const selected = _selection.getSelection();
            if (selected.length > 0) {
                const item = selected[0] as any;
                const possibleId = resolveRecordId(item);
                if (possibleId) {
                    diag.info("Grid row selected", { possibleId });
                } else {
                    diag.info("Grid row selected without direct id, forwarding row object", {
                        itemSample: Object.keys(item || {})
                    });
                }
                onRecordSelect(item);
            }
        }
    });

    const openJsonForRow = React.useCallback((item: any) => {
        try {
            const filtered: Record<string, any> = {};
            Object.keys(item || {}).forEach((key) => {
                if (!key || key.includes('@') || key.toLowerCase().startsWith('odata.')) {
                    return;
                }

                const value = item[key];
                if (value === null || value === undefined || value === '') {
                    return;
                }

                filtered[key] = value;
            });

            const pretty = JSON.stringify(filtered, null, 2);
            const blob = new Blob([pretty], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            window.open(url, '_blank', 'noopener,noreferrer');
            window.setTimeout(() => URL.revokeObjectURL(url), 30000);
        } catch (error) {
            diag.error('Failed to open row JSON', error);
        }
    }, []);

    const jsonColumn: IColumn = {
        key: '__open_json__',
        name: 'Record',
        fieldName: '__open_json__',
        minWidth: 110,
        maxWidth: 130,
        isResizable: false,
        onRender: (item?: any) => (
            <button
                type="button"
                className="ltr-grid-json-link"
                onClick={(ev) => {
                    ev.preventDefault();
                    ev.stopPropagation();
                    openJsonForRow(item);
                }}
            >
                Open JSON
            </button>
        )
    };

    const gridColumns: IColumn[] = columns.map(c => ({
        key: c.name,
        name: c.displayName || c.name,
        fieldName: c.name,
        minWidth: c.width,
        maxWidth: c.width * 2,
        isResizable: true,
        onRenderHeader: () => {
            const isFiltered = !!(columnFilters[c.name] || '').trim();
            return (
                <div className="ltr-grid-header-cell">
                    <div className="ltr-grid-header-row">
                        <div className="ltr-grid-header-title">{c.displayName || c.name}</div>
                        <IconButton
                            iconProps={{ iconName: 'Filter' }}
                            title={isFiltered ? 'Filter applied' : 'Filter column'}
                            ariaLabel={isFiltered ? 'Filter applied' : 'Filter column'}
                            className={isFiltered ? 'ltr-grid-filter-icon active' : 'ltr-grid-filter-icon'}
                            onClick={(ev) => {
                                setActiveFilterColumn(c.name);
                                setFilterDraft(columnFilters[c.name] || '');
                                setFilterAnchor(ev.currentTarget as HTMLElement);
                            }}
                        />
                    </div>
                </div>
            );
        }
    }));

    const applyFilter = () => {
        if (!activeFilterColumn) {
            return;
        }
        onColumnFilterChange(activeFilterColumn, filterDraft);
        setFilterAnchor(undefined);
    };

    const clearFilter = () => {
        if (!activeFilterColumn) {
            return;
        }
        onColumnFilterChange(activeFilterColumn, '');
        setFilterDraft('');
        setFilterAnchor(undefined);
    };

    const closeFlyout = () => {
        setFilterAnchor(undefined);
    };

    const activeColumnDisplay = columns.find(c => c.name === activeFilterColumn)?.displayName || activeFilterColumn || '';

    return (
        <div className="ltr-grid-container">
            <DetailsList
                items={data}
                columns={[jsonColumn, ...gridColumns]}
                selectionMode={SelectionMode.single}
                selection={_selection}
                layoutMode={DetailsListLayoutMode.justified}
                isHeaderVisible={true}
                onItemInvoked={(item) => {
                    const possibleId = resolveRecordId(item);
                    if (possibleId) {
                        diag.info("Grid row invoked", { possibleId });
                    } else {
                        diag.info("Grid row invoked without direct id, forwarding row object", {
                            itemSample: Object.keys(item || {})
                        });
                    }
                    onRecordSelect(item);
                }}
            />

            {filterAnchor && (
                <Callout
                    className="ltr-grid-filter-callout"
                    target={filterAnchor}
                    onDismiss={closeFlyout}
                    setInitialFocus
                    directionalHint={DirectionalHint.bottomAutoEdge}
                >
                    <div className="ltr-grid-filter-flyout">
                        <div className="ltr-grid-filter-title">Filter {activeColumnDisplay}</div>
                        <TextField
                            value={filterDraft}
                            placeholder="Enter value"
                            onChange={(_e, value) => setFilterDraft(value || '')}
                            onKeyDown={(ev) => {
                                if (ev.key === 'Enter') {
                                    applyFilter();
                                }
                            }}
                        />
                        <div className="ltr-grid-filter-actions">
                            <PrimaryButton text="Apply" onClick={applyFilter} />
                            <DefaultButton text="Clear" onClick={clearFilter} />
                        </div>
                    </div>
                </Callout>
            )}
        </div>
    );
};
