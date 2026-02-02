import * as React from 'react';
import { IInputs } from "../generated/ManifestTypes";
import { LtrService, IViewDefinition, IFormDefinition } from '../services/LtrService';
import { XmlParserHelper, IGridColumn, IFormTab } from '../utils/XmlParser';
import { DynamicGrid } from './DynamicGrid';
import { DynamicForm } from './DynamicForm';
import { Dropdown, IDropdownOption } from '@fluentui/react/lib/Dropdown';
import { Spinner, SpinnerSize } from '@fluentui/react/lib/Spinner';

interface IAppProps {
    context: ComponentFramework.Context<IInputs>;
    targetEntity: string;
    isArchive: boolean;
}

const App: React.FC<IAppProps> = (props) => {
    const { context, targetEntity, isArchive } = props;

    // Services
    const [ltrService] = React.useState(new LtrService(context, targetEntity));

    // State
    const [loading, setLoading] = React.useState<boolean>(false);
    const [views, setViews] = React.useState<IViewDefinition[]>([]);
    const [detailsForms, setDetailsForms] = React.useState<IFormDefinition[]>([]);

    // Selection state
    const [selectedViewId, setSelectedViewId] = React.useState<string>();
    const [selectedFormId, setSelectedFormId] = React.useState<string>();

    // Data state
    const [gridData, setGridData] = React.useState<any[]>([]);
    const [gridColumns, setGridColumns] = React.useState<IGridColumn[]>([]);
    const [definitions, setDefinitions] = React.useState<IFormTab[]>([]); // Parsed Form

    // Navigation
    const [viewMode, setViewMode] = React.useState<'GRID' | 'FORM'>('GRID');
    const [selectedRecord, setSelectedRecord] = React.useState<any>(null);

    // Initial Load
    React.useEffect(() => {
        const loadMetadata = async () => {
            setLoading(true);
            const vs = await ltrService.getSystemViews();
            const fs = await ltrService.getSystemForms();

            setViews(vs);
            setDetailsForms(fs);

            // Default selections
            if (vs.length > 0) handleViewChange(vs[0].id, vs);
            if (fs.length > 0) setSelectedFormId(fs[0].id);

            setLoading(false);
        };
        loadMetadata();
    }, [targetEntity]);

    // Handlers
    const handleViewChange = async (viewId: string, currentViews = views) => {
        setLoading(true);
        setSelectedViewId(viewId);
        const view = currentViews.find(v => v.id === viewId);
        if (view) {
            // 1. Parse Layout
            const columns = XmlParserHelper.parseLayoutXml(view.layoutXml);
            setGridColumns(columns);

            // 2. Fetch Data
            const data = await ltrService.getLtrData(view.fetchXml, isArchive);
            setGridData(data);
        }
        setLoading(false);
    };

    const handleFormChange = async (formId: string) => {
        setSelectedFormId(formId);
        // Pre-parse the form XML so it's ready when we click a record
        const form = detailsForms.find(f => f.id === formId);
        if (form) {
            const parsedForm = XmlParserHelper.parseFormXml(form.formXml);
            setDefinitions(parsedForm);
        }
    };

    const handleRecordSelect = async (id: string) => {
        // We might already have the data in gridData, but let's assume we want fresh specific details 
        // OR just pass the row data if it's simpler. 
        // For LTR, API might be precious, let's try to find it in memory first or fetch single.

        let record = gridData.find(r => r[targetEntity + 'id'] === id || r.id === id); // naive check

        if (!record) {
            // Fetch if not in grid (pagination not implemented yet)
            record = await ltrService.getRecordDetails(id, isArchive);
        }

        // Ensure form definition is parsed
        if (!definitions.length && selectedFormId) {
            handleFormChange(selectedFormId);
        }

        setSelectedRecord(record);
        setViewMode('FORM');
    };

    return (
        <div className="ltr-app">
            {loading && <Spinner size={SpinnerSize.large} label="Loading LTR Data..." />}

            <div className="ltr-header">
                {!loading && viewMode === 'GRID' && (
                    <Dropdown
                        label="Select View"
                        selectedKey={selectedViewId}
                        options={views.map(v => ({ key: v.id, text: v.name }))}
                        onChange={(e, opt) => opt && handleViewChange(opt.key as string)}
                        styles={{ root: { width: 300 } }}
                    />
                )}
                {!loading && (
                    <Dropdown
                        label="Select Form Definition"
                        selectedKey={selectedFormId}
                        options={detailsForms.map(f => ({ key: f.id, text: f.name }))}
                        onChange={(e, opt) => opt && handleFormChange(opt.key as string)}
                        styles={{ root: { width: 300, marginLeft: 20 } }}
                    />
                )}
            </div>

            <div className="ltr-content">
                {!loading && viewMode === 'GRID' && (
                    <DynamicGrid
                        columns={gridColumns}
                        data={gridData}
                        onRecordSelect={(id) => handleRecordSelect(id)}
                    />
                )}
                {!loading && viewMode === 'FORM' && (
                    <DynamicForm
                        formData={selectedRecord}
                        formDefinition={definitions}
                        onBack={() => setViewMode('GRID')}
                    />
                )}
            </div>
        </div>
    );
};

export default App;
