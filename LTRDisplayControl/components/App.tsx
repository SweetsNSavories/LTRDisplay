import * as React from 'react';
import { IInputs } from "../generated/ManifestTypes";
import { LtrService, IViewDefinition, IFormDefinition } from '../services/LtrService';
import { XmlParserHelper, IGridColumn, IFormTab } from '../utils/XmlParser';
import { DynamicGrid } from './DynamicGrid';
import { DynamicForm } from './DynamicForm';
import { Dropdown, IDropdownOption } from '@fluentui/react/lib/Dropdown';
import { Spinner, SpinnerSize } from '@fluentui/react/lib/Spinner';
import { diag } from '../utils/Diagnostics';

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
            try {
                diag.info("Loading metadata");
                const vs = await ltrService.getSystemViews();
                const fs = await ltrService.getSystemForms();

                setViews(vs);
                setDetailsForms(fs);
                diag.info("Metadata loaded", { views: vs.length, forms: fs.length });

                // Default selections
                if (vs.length > 0) handleViewChange(vs[0].id, vs);
                if (fs.length > 0) setSelectedFormId(fs[0].id);
            } catch (err) {
                diag.error("Metadata load failed", err);
            } finally {
                setLoading(false);
            }
        };
        loadMetadata();
    }, [targetEntity]);

    // Handlers
    const handleViewChange = async (viewId: string, currentViews = views) => {
        setLoading(true);
        try {
            setSelectedViewId(viewId);
            const view = currentViews.find(v => v.id === viewId);
            if (!view) {
                diag.error("Selected view not found", null, { viewId });
                return;
            }

            diag.info("View selected", { viewId, viewName: view.name, isArchive });

            // 1. Parse Layout
            const columns = XmlParserHelper.parseLayoutXml(view.layoutXml);
            setGridColumns(columns);
            diag.info("Parsed layout columns", { count: columns.length });

            // 2. Fetch Data
            const data = await ltrService.getLtrData(view.fetchXml, isArchive);
            setGridData(data);
            diag.info("Grid data loaded", { count: data.length });
        } catch (err) {
            diag.error("View change failed", err, { viewId, isArchive });
        } finally {
            setLoading(false);
        }
    };

    const handleFormChange = async (formId: string) => {
        try {
            setSelectedFormId(formId);
            const form = detailsForms.find(f => f.id === formId);
            if (!form) {
                diag.error("Selected form not found", null, { formId });
                return;
            }
            const parsedForm = XmlParserHelper.parseFormXml(form.formXml);
            setDefinitions(parsedForm);
            diag.info("Form parsed", { formId, sections: parsedForm.length });
        } catch (err) {
            diag.error("Form change failed", err, { formId });
        }
    };

    const handleRecordSelect = async (id: string) => {
        try {
            diag.info("Record selected", { id });
            let record = gridData.find(r => r[targetEntity + 'id'] === id || r.id === id); // naive check

            if (!record) {
                record = await ltrService.getRecordDetails(id, isArchive);
            }

            if (!record) {
                diag.error("Record not found", null, { id, isArchive });
                return;
            }

            // Ensure form definition is parsed
            if (!definitions.length && selectedFormId) {
                await handleFormChange(selectedFormId);
            }

            setSelectedRecord(record);
            setViewMode('FORM');
        } catch (err) {
            diag.error("Record select failed", err, { id, isArchive });
        }
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
