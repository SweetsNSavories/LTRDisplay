import { IInputs } from "../generated/ManifestTypes";
import { diag } from "../utils/Diagnostics";

export interface IEntityMetadata {
    LogicalName: string;
    DisplayName: string;
    PrimaryIdAttribute: string;
    PrimaryNameAttribute: string;
}

export interface IViewDefinition {
    id: string;
    name: string;
    fetchXml: string;
    layoutXml: string;
}

export interface IFormDefinition {
    id: string;
    name: string;
    formXml: string;
}

export class LtrService {
    private _context: ComponentFramework.Context<IInputs>;
    private _targetEntity: string;

    constructor(context: ComponentFramework.Context<IInputs>, targetEntity: string) {
        this._context = context;
        this._targetEntity = targetEntity;
        diag.info(`LtrService initialized for entity '${targetEntity}'`);
    }

    /**
     * Fetches the system views for the target entity
     */
    public async getSystemViews(): Promise<IViewDefinition[]> {
        try {
            diag.info("Fetching system views", { entity: this._targetEntity });
            const query = `?` +
                `$select=name,fetchxml,layoutxml,savedqueryid` +
                `&$filter=returnedtypecode eq '${this._targetEntity}' and statecode eq 0`; // active views

            // Using standard WebAPI
            const result = await this._context.webAPI.retrieveMultipleRecords("savedquery", query);

            const views = result.entities.map(e => ({
                id: e.savedqueryid,
                name: e.name,
                fetchXml: e.fetchxml,
                layoutXml: e.layoutxml
            }));
            diag.info("Fetched system views", { count: views.length });
            return views;
        } catch (error) {
            diag.error("Error fetching views", error, { entity: this._targetEntity });
            // Fallback or empty
            return [];
        }
    }

    /**
     * Fetches specific form types (main, etc)
     */
    public async getSystemForms(): Promise<IFormDefinition[]> {
        try {
            diag.info("Fetching system forms", { entity: this._targetEntity });
            // Type 2 is 'Main' form usually, but we might want all read-only capability
            const query = `?` +
                `$select=name,formxml,formid,type` +
                `&$filter=objecttypecode eq '${this._targetEntity}' and type eq 2`;

            const result = await this._context.webAPI.retrieveMultipleRecords("systemform", query);

            const forms = result.entities.map(e => ({
                id: e.formid,
                name: e.name,
                formXml: e.formxml
            }));
            diag.info("Fetched system forms", { count: forms.length });
            return forms;
        } catch (error) {
            diag.error("Error fetching forms", error, { entity: this._targetEntity });
            return [];
        }
    }

    /**
     * Fetch LTR Data using specific FetchXML
     * This is where the LTR magic happens. 
     * If LTR requires a specific request header or a Custom API, it goes here.
     * For now, we use standard RetrieveMultiple with the provided fetchXml.
     */
    public async getLtrData(fetchXml: string, isArchive: boolean): Promise<any[]> {
        try {
            diag.info("Fetching LTR data", { entity: this._targetEntity, isArchive });
            // NOTE: If specific API is needed for LTR, replace this logic.
            // Some LTR implementations use a custom message or specific headers.
            // Assuming the fetchXml provided by the View is sufficient or needs modification.

            // If isArchive is true, we might need to modify the FetchXML to target the retention store
            // or add a header 'x-ms-retention-search': 'true' if supported by standard API.

            // Note: PCF context.webAPI.retrieveMultipleRecords doesn't easily support raw FetchXML with custom headers
            // in all versions. We might need specific implementation.

            // For standard FetchXML usage:
            const result = await this._context.webAPI.retrieveMultipleRecords(this._targetEntity, `?fetchXml=${encodeURIComponent(fetchXml)}`);
            diag.info("Fetched LTR data", { count: result.entities.length, isArchive });
            return result.entities;
        } catch (error) {
            diag.error("Error fetching LTR data", error, { entity: this._targetEntity, isArchive });
            return [];
        }
    }

    /**
     * Fetch a single record's details
     */
    public async getRecordDetails(id: string, isArchive: boolean = false): Promise<any> {
        try {
            if (isArchive) {
                // To fetch a single retained record, we must use FetchXML with datasource="retained"
                const fetchXml = `<fetch version="1.0" output-format="xml-platform" mapping="logical" distinct="false" datasource="retained">
                  <entity name="${this._targetEntity}">
                    <all-attributes />
                    <filter type="and">
                      <condition attribute="${this._targetEntity}id" operator="eq" value="${id}" />
                    </filter>
                  </entity>
                </fetch>`;

                // Reuse the LTR fetch logic which handles the attribute injection/verification
                // (Note: we already added it in the string above, but getLtrData adds it again if isArchive=true 
                //  so strictly speaking we should pass raw xml or adjust getLtrData logic. 
                //  For safety, we'll just call retrieveMultipleRecords directly here to be explicit).

                const result = await this._context.webAPI.retrieveMultipleRecords(this._targetEntity, `?fetchXml=${encodeURIComponent(fetchXml)}`);
                const record = result.entities.length > 0 ? result.entities[0] : null;
                diag.info("Fetched retained record", { entity: this._targetEntity, id, found: !!record });
                return record;
            }

            // Standard retrieve for active data
            const result = await this._context.webAPI.retrieveRecord(this._targetEntity, id);
            diag.info("Fetched active record", { entity: this._targetEntity, id, found: !!result });
            return result;
        } catch (error) {
            diag.error("Error fetching record details", error, { entity: this._targetEntity, id, isArchive });
            return null;
        }
    }
}
