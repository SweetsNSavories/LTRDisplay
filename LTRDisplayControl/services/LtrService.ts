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

export interface IRetentionEnabledEntity {
    logicalName: string;
    displayName?: string;
}

export interface IRelatedRelationship {
    key: string;
    schemaName: string;
    parentEntity: string;
    childEntity: string;
    childLookupAttribute: string;
}

const TECHNICAL_CHILD_ENTITIES = new Set([
    "activityparty",
    "asyncoperation",
    "bulkdeletefailure",
    "duplicaterecord",
    "duplicaterulecondition",
    "importfile",
    "importlog",
    "importmap",
    "mailboxtrackingfolder",
    "principalobjectaccess",
    "processsession",
    "subscriptionstatisticsoffline",
    "syncerror",
    "userentityinstancedata"
]);

const TECHNICAL_ENTITY_PREFIXES = [
    "adx_",
    "msdynmkt_"
];

export class LtrService {
    private _context: ComponentFramework.Context<IInputs>;
    private _targetEntity: string;
    private _retentionEnabledCache: Record<string, boolean>;
    private _archivalEnabledCache: Record<string, boolean>;

    constructor(context: ComponentFramework.Context<IInputs>, targetEntity: string) {
        this._context = context;
        this._targetEntity = targetEntity;
        this._retentionEnabledCache = {};
        this._archivalEnabledCache = {};
        diag.info(`LtrService initialized for entity '${targetEntity}'`);
    }

    private ensureRetainedFetch(fetchXml: string): string {
        // Inject datasource="retained" on the root fetch for archive pulls.
        if (!fetchXml) return fetchXml;
        const alreadyTagged = /<fetch[^>]*datasource\s*=\s*"retained"/i.test(fetchXml);
        if (alreadyTagged) return fetchXml;
        const updated = fetchXml.replace(/<fetch\b([^>]*)>/i, (_match, attrs) => `<fetch${attrs} datasource="retained">`);
        return updated || fetchXml;
    }

    private buildRelatedFetch(relationship: IRelatedRelationship, parentId: string, maxRows: number): string {
        const id = parentId.replace(/[{}]/g, "");
        return `<fetch version="1.0" mapping="logical" top="${Math.max(1, maxRows)}">
            <entity name="${relationship.childEntity}">
                <all-attributes />
                <filter type="and">
                    <condition attribute="${relationship.childLookupAttribute}" operator="eq" value="${id}" />
                </filter>
            </entity>
        </fetch>`;
    }

    private async fetchMetadata(path: string): Promise<any> {
        const globalContext = (window as any).Xrm?.Utility?.getGlobalContext?.();
        const clientUrl = globalContext?.getClientUrl?.();
        if (!clientUrl) {
            throw new Error("Dataverse client URL not available for metadata query");
        }

        const response = await fetch(`${clientUrl}/api/data/v9.2/${path}`, {
            method: "GET",
            headers: {
                "Accept": "application/json",
                "OData-MaxVersion": "4.0",
                "OData-Version": "4.0"
            },
            credentials: "same-origin"
        });

        if (!response.ok) {
            throw new Error(`Metadata request failed: ${response.status} ${response.statusText}`);
        }

        return response.json();
    }

    private isBusinessRelevantRelationship(relationship: any): boolean {
        const schemaName = String(relationship?.SchemaName || "");
        const parent = String(relationship?.ReferencedEntity || "").toLowerCase();
        const child = String(relationship?.ReferencingEntity || "").toLowerCase();
        const lookup = String(relationship?.ReferencingAttribute || "").toLowerCase();

        if (!schemaName || !child || !lookup) {
            return false;
        }

        if (parent !== this._targetEntity.toLowerCase()) {
            return false;
        }

        if (child === this._targetEntity.toLowerCase()) {
            return false;
        }

        if (TECHNICAL_CHILD_ENTITIES.has(child)) {
            return false;
        }

        if (TECHNICAL_ENTITY_PREFIXES.some(prefix => child.startsWith(prefix))) {
            return false;
        }

        if (
            lookup.includes("createdby") ||
            lookup.includes("modifiedby") ||
            lookup.includes("owninguser") ||
            lookup.includes("owningteam") ||
            lookup.includes("owningbusinessunit")
        ) {
            return false;
        }

        if (schemaName.toLowerCase().includes("principalobjectaccess")) {
            return false;
        }

        return true;
    }

    public async isEntityRetentionEnabled(entityLogicalName?: string): Promise<boolean | undefined> {
        const entity = (entityLogicalName || this._targetEntity || '').toLowerCase();
        if (!entity) {
            return undefined;
        }

        if (typeof this._retentionEnabledCache[entity] === 'boolean') {
            return this._retentionEnabledCache[entity];
        }

        try {
            const encoded = entity.replace(/'/g, "''");
            const candidateProps = [
                'IsArchivalEnabled',
                'IsRetentionEnabled'
            ];

            for (const property of candidateProps) {
                try {
                    const metadata = await this.fetchMetadata(`EntityDefinitions(LogicalName='${encoded}')?$select=LogicalName,${property}`);
                    if (typeof metadata?.[property] === 'boolean') {
                        const enabled = metadata[property];
                        this._retentionEnabledCache[entity] = enabled;
                        diag.info("Checked retention-enabled metadata", { entity, property, enabled });
                        return enabled;
                    }
                } catch {
                    // Try next candidate property.
                }
            }

            const metadata = await this.fetchMetadata(`EntityDefinitions(LogicalName='${encoded}')?$select=LogicalName`);
            const dynamicKey = Object.keys(metadata || {}).find(k => /archiv|retention/i.test(k));
            if (dynamicKey && typeof metadata?.[dynamicKey] === 'boolean') {
                const enabled = metadata[dynamicKey];
                this._retentionEnabledCache[entity] = enabled;
                diag.info("Checked retention-enabled metadata", { entity, property: dynamicKey, enabled });
                return enabled;
            }

            diag.info("Retention-enabled metadata property not found", { entity });
            return undefined;
        } catch (error) {
            diag.error("Error checking retention-enabled metadata", error, { entity });
            return undefined;
        }
    }

    public async isEntityArchivalEnabled(entityLogicalName?: string): Promise<boolean> {
        const entity = (entityLogicalName || this._targetEntity || '').toLowerCase();
        if (!entity) {
            return false;
        }

        if (typeof this._archivalEnabledCache[entity] === 'boolean') {
            return this._archivalEnabledCache[entity];
        }

        try {
            const encoded = entity.replace(/'/g, "''");
            const metadata = await this.fetchMetadata(`EntityDefinitions(LogicalName='${encoded}')?$select=LogicalName,IsArchivalEnabled`);
            const enabled = metadata?.IsArchivalEnabled === true;
            this._archivalEnabledCache[entity] = enabled;
            diag.info("Checked archival-enabled metadata", { entity, enabled });
            return enabled;
        } catch (error) {
            diag.info("Archival-enabled metadata check failed", {
                entity,
                error: error instanceof Error ? error.message : String(error)
            });
            this._archivalEnabledCache[entity] = false;
            return false;
        }
    }

    public async getRetentionEnabledEntities(): Promise<IRetentionEnabledEntity[]> {
        diag.info("Discovering retention-enabled entities", {
            targetEntity: this._targetEntity,
            source: "retentionconfigs"
        });

        // Primary source of truth: active retention policy configurations.
        try {
            const query = `?$select=entitylogicalname,statecode,statuscode&$filter=statecode eq 0`;
            const result = await this._context.webAPI.retrieveMultipleRecords("retentionconfig", query);
            const logicalNames = Array.from(new Set(
                (result.entities || [])
                    .map((r: any) => String(r.entitylogicalname || "").toLowerCase().trim())
                    .filter((name: string) => !!name)
            ));

            if (logicalNames.length === 0) {
                diag.info("No active retentionconfigs found; falling back to metadata flags");
                throw new Error("NoActiveRetentionConfigs");
            }

            const checks = await Promise.all(logicalNames.map(async (logicalName) => {
                const encoded = logicalName.replace(/'/g, "''");
                try {
                    const metadata = await this.fetchMetadata(`EntityDefinitions(LogicalName='${encoded}')?$select=LogicalName,DisplayName`);
                    const label =
                        metadata?.DisplayName?.UserLocalizedLabel?.Label ||
                        metadata?.DisplayName?.LocalizedLabels?.[0]?.Label ||
                        logicalName;
                    return {
                        logicalName,
                        displayName: label,
                        include: true
                    };
                } catch {
                    // Keep logical name even if label metadata fails.
                    return {
                        logicalName,
                        displayName: logicalName,
                        include: true
                    };
                }
            }));

            const entities = checks
                .filter(c => c.include)
                .map(c => ({ logicalName: c.logicalName, displayName: c.displayName as string }))
                .sort((a, b) => (a.displayName || a.logicalName).localeCompare(b.displayName || b.logicalName));

            diag.info("Fetched retention-enabled entities from retentionconfigs", {
                configCount: result.entities?.length || 0,
                uniqueEntityCount: entities.length
            });
            return entities;
        } catch (error) {
            diag.info("Retentionconfig query failed, falling back to metadata flags", {
                error: error instanceof Error ? error.message : String(error)
            });
        }

        const candidateProps = [
            'IsArchivalEnabled',
            'IsRetentionEnabled'
        ];

        for (const property of candidateProps) {
            try {
                diag.info("Fallback querying retention metadata property", { property });
                const metadata = await this.fetchMetadata(
                    `EntityDefinitions?$select=LogicalName,DisplayName,${property}`
                );

                const rows = Array.isArray(metadata?.value) ? metadata.value : [];
                if (rows.length === 0) {
                    continue;
                }

                const entities = rows
                    .filter((r: any) => !!r?.LogicalName && r?.[property] === true)
                    .map((r: any) => {
                        const label =
                            r?.DisplayName?.UserLocalizedLabel?.Label ||
                            r?.DisplayName?.LocalizedLabels?.[0]?.Label ||
                            undefined;
                        return {
                            logicalName: String(r.LogicalName).toLowerCase(),
                            displayName: label
                        } as IRetentionEnabledEntity;
                    })
                    .sort((a, b) => (a.displayName || a.logicalName).localeCompare(b.displayName || b.logicalName));

                return entities;
            } catch {
                // continue
            }
        }

        diag.info("Unable to query retention-enabled entities using known metadata properties");
        return [];
    }

    private ensurePrimaryIdAttribute(fetchXml: string): string {
        if (!fetchXml) return fetchXml;
        const primaryId = `${this._targetEntity}id`;
        const hasPrimaryId = new RegExp(`<attribute\\s+name=["']${primaryId}["']`, "i").test(fetchXml);
        if (hasPrimaryId) return fetchXml;

        const entityOpenTag = new RegExp(`(<entity\\s+name=["']${this._targetEntity}["'][^>]*>)`, "i");
        if (entityOpenTag.test(fetchXml)) {
            return fetchXml.replace(entityOpenTag, `$1<attribute name="${primaryId}" />`);
        }

        return fetchXml;
    }

    private expandFetchToAllColumns(fetchXml: string): string {
        if (!fetchXml) return fetchXml;
        if (/<all-attributes\s*\/?>/i.test(fetchXml)) {
            return fetchXml;
        }

        // Expand the root entity selection to all columns so detail view can be opened from in-memory data.
        return fetchXml.replace(/(<entity\b[^>]*>)/i, "$1<all-attributes />");
    }

    /**
     * Fetches the system views for the target entity
     */
    public async getSystemViews(): Promise<IViewDefinition[]> {
        try {
            diag.info("Fetching system views", { entity: this._targetEntity });
            const query = `?` +
                `$select=name,fetchxml,layoutxml,savedqueryid` +
                `&$filter=returnedtypecode eq '${this._targetEntity}' and statecode eq 0` +
                `&$orderby=name asc`; // active views

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
                `&$filter=objecttypecode eq '${this._targetEntity}' and type eq 2 and formactivationstate eq 1` +
                `&$orderby=name asc`;

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
    public async getLtrData(fetchXml: string, isArchive: boolean, maxRows: number = 5000): Promise<any[]> {
        try {
            diag.info("Fetching LTR data", { entity: this._targetEntity, isArchive });
            const expanded = this.expandFetchToAllColumns(fetchXml);
            const withPrimaryId = this.ensurePrimaryIdAttribute(expanded);
            const effectiveFetch = isArchive ? this.ensureRetainedFetch(withPrimaryId) : withPrimaryId;
            // NOTE: If specific API is needed for LTR, replace this logic.
            // Some LTR implementations use a custom message or specific headers.
            // Assuming the fetchXml provided by the View is sufficient or needs modification.

            // If isArchive is true, we might need to modify the FetchXML to target the retention store
            // or add a header 'x-ms-retention-search': 'true' if supported by standard API.

            // Note: PCF context.webAPI.retrieveMultipleRecords doesn't easily support raw FetchXML with custom headers
            // in all versions. We might need specific implementation.

            // For standard FetchXML usage:
            const pageSize = Math.min(Math.max(maxRows, 1), 5000);
            let result = await this._context.webAPI.retrieveMultipleRecords(this._targetEntity, `?fetchXml=${encodeURIComponent(effectiveFetch)}`, pageSize);
            const allRows = [...(result.entities || [])];

            let nextLink = (result as any).nextLink || (result as any)["@odata.nextLink"];
            while (nextLink && allRows.length < maxRows) {
                const remaining = maxRows - allRows.length;
                const nextOptions = typeof nextLink === "string" && nextLink.includes("?")
                    ? `?${nextLink.split("?")[1]}`
                    : nextLink;

                result = await this._context.webAPI.retrieveMultipleRecords(
                    this._targetEntity,
                    nextOptions,
                    Math.min(remaining, 5000)
                );

                allRows.push(...(result.entities || []));
                nextLink = (result as any).nextLink || (result as any)["@odata.nextLink"];
            }

            const capped = allRows.slice(0, maxRows);
            diag.info("Fetched LTR data", { count: capped.length, isArchive, maxRows });
            return capped;
        } catch (error) {
            diag.error("Error fetching LTR data", error, { entity: this._targetEntity, isArchive });
            return [];
        }
    }

    public async getOneToManyRelationships(): Promise<IRelatedRelationship[]> {
        try {
            diag.info("Fetching one-to-many relationship metadata", { entity: this._targetEntity });
            const encodedEntity = this._targetEntity.replace(/'/g, "''");
            const metadataPath =
                `EntityDefinitions(LogicalName='${encodedEntity}')` +
                `?$select=LogicalName` +
                `&$expand=OneToManyRelationships(` +
                `$select=SchemaName,ReferencedEntity,ReferencingEntity,ReferencingAttribute` +
                `)`;

            const metadata = await this.fetchMetadata(metadataPath);
            const relationshipsRaw = metadata?.OneToManyRelationships || [];

            const relationshipsUnfiltered: IRelatedRelationship[] = relationshipsRaw
                .filter((r: any) =>
                    r &&
                    typeof r.SchemaName === "string" &&
                    typeof r.ReferencingEntity === "string" &&
                    typeof r.ReferencingAttribute === "string" &&
                    this.isBusinessRelevantRelationship(r)
                )
                .map((r: any) => ({
                    key: r.SchemaName,
                    schemaName: r.SchemaName,
                    parentEntity: r.ReferencedEntity,
                    childEntity: r.ReferencingEntity,
                    childLookupAttribute: r.ReferencingAttribute
                }))
                .sort((a, b) => a.childEntity.localeCompare(b.childEntity) || a.schemaName.localeCompare(b.schemaName));

            const childRetentionChecks = await Promise.all(
                relationshipsUnfiltered.map(async (relationship) => ({
                    relationship,
                    enabled: await this.isEntityArchivalEnabled(relationship.childEntity)
                }))
            );

            const relationships = childRetentionChecks
                .filter(item => item.enabled === true)
                .map(item => item.relationship);

            diag.info("Fetched one-to-many relationship metadata", {
                entity: this._targetEntity,
                total: relationshipsRaw.length,
                filtered: relationships.length
            });
            return relationships;
        } catch (error) {
            diag.error("Error fetching relationship metadata", error, { entity: this._targetEntity });
            return [];
        }
    }

    public async getRelatedRecords(relationship: IRelatedRelationship, parentId: string, isArchive: boolean, maxRows: number = 250): Promise<any[]> {
        try {
            const fetchXml = this.buildRelatedFetch(relationship, parentId, maxRows);
            const effectiveFetch = isArchive ? this.ensureRetainedFetch(fetchXml) : fetchXml;
            diag.info("Fetching related records", {
                relationship: relationship.schemaName,
                childEntity: relationship.childEntity,
                parentId,
                isArchive,
                maxRows
            });
            const result = await this._context.webAPI.retrieveMultipleRecords(relationship.childEntity, `?fetchXml=${encodeURIComponent(effectiveFetch)}`, Math.min(Math.max(maxRows, 1), 5000));
            diag.info("Fetched related records", {
                relationship: relationship.schemaName,
                childEntity: relationship.childEntity,
                count: result.entities.length
            });
            return result.entities;
        } catch (error) {
            diag.error("Error fetching related records", error, {
                relationship: relationship.schemaName,
                childEntity: relationship.childEntity,
                parentId,
                isArchive
            });
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
