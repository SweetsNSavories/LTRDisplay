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

export interface ISearchableAttribute {
    logicalName: string;
    displayName?: string;
    attributeType: string;
}

export interface IRelatedRelationship {
    key: string;
    schemaName: string;
    parentEntity: string;
    childEntity: string;
    childLookupAttribute: string;
}

export interface IAuditHistoryItem {
    id: string;
    eventKey: string;
    createdOn?: string;
    changedBy: string;
    attribute: string;
    oldValue: string;
    newValue: string;
    operation?: string;
    action?: string;
}

interface IParsedAuditAttributeChange {
    attribute: string;
    oldValue?: string;
    newValue?: string;
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

const INTERNAL_RETENTION_ENTITIES = new Set([
    "retentionconfig",
    "retentionsuccessdetail",
    "retentioncleanupdetail",
    "retentionfailuredetail"
]);

const MAX_LTR_FETCH_ATTEMPTS = 12;

export class LtrService {
    private _context: ComponentFramework.Context<IInputs>;
    private _targetEntity: string;
    private _retentionEnabledCache: Record<string, boolean>;
    private _archivalEnabledCache: Record<string, boolean>;
    private _attributeNamesCache: Record<string, string[]>;
    private _searchableAttributesCache: Record<string, ISearchableAttribute[]>;
    private _entityMetadataCache: Record<string, IEntityMetadata>;

    constructor(context: ComponentFramework.Context<IInputs>, targetEntity: string) {
        this._context = context;
        this._targetEntity = targetEntity;
        this._retentionEnabledCache = {};
        this._archivalEnabledCache = {};
        this._attributeNamesCache = {};
        this._searchableAttributesCache = {};
        this._entityMetadataCache = {};
        diag.info(`LtrService initialized for entity '${targetEntity}'`);
    }

    private async getEntityMetadata(entityLogicalName?: string): Promise<IEntityMetadata | undefined> {
        const entity = (entityLogicalName || this._targetEntity || '').toLowerCase();
        if (!entity) {
            return undefined;
        }

        if (this._entityMetadataCache[entity]) {
            return this._entityMetadataCache[entity];
        }

        try {
            const encoded = entity.replace(/'/g, "''");
            const metadata = await this.fetchMetadata(
                `EntityDefinitions(LogicalName='${encoded}')?` +
                `$select=LogicalName,PrimaryIdAttribute,PrimaryNameAttribute,DisplayName`
            );

            const displayName =
                metadata?.DisplayName?.UserLocalizedLabel?.Label ||
                metadata?.DisplayName?.LocalizedLabels?.[0]?.Label ||
                entity;

            const resolved: IEntityMetadata = {
                LogicalName: String(metadata?.LogicalName || entity).toLowerCase(),
                DisplayName: String(displayName),
                PrimaryIdAttribute: String(metadata?.PrimaryIdAttribute || `${entity}id`).toLowerCase(),
                PrimaryNameAttribute: String(metadata?.PrimaryNameAttribute || '').toLowerCase()
            };

            this._entityMetadataCache[entity] = resolved;
            return resolved;
        } catch (error) {
            diag.info('Failed to load entity metadata', {
                entity,
                error: error instanceof Error ? error.message : String(error)
            });
            return undefined;
        }
    }

    private isInternalRetentionEntity(entityLogicalName: string): boolean {
        const logical = (entityLogicalName || '').toLowerCase().trim();
        if (!logical) {
            return false;
        }

        if (INTERNAL_RETENTION_ENTITIES.has(logical)) {
            return true;
        }

        return logical.startsWith('retention') && logical.endsWith('detail');
    }

    public async getSearchableAttributes(entityLogicalName?: string): Promise<ISearchableAttribute[]> {
        const entity = (entityLogicalName || this._targetEntity || '').toLowerCase();
        if (!entity) {
            return [];
        }

        if (this._searchableAttributesCache[entity]) {
            return this._searchableAttributesCache[entity];
        }

        try {
            const encoded = entity.replace(/'/g, "''");
            const metadata = await this.fetchMetadata(
                `EntityDefinitions(LogicalName='${encoded}')?` +
                `$select=LogicalName&$expand=Attributes(` +
                `$select=LogicalName,DisplayName,AttributeType,AttributeTypeName,IsValidForRead,IsValidForAdvancedFind,IsLogical` +
                `)`
            );

            const attributes = Array.isArray(metadata?.Attributes) ? metadata.Attributes : [];
            const rows = attributes
                .filter((a: any) => {
                    if (!a?.LogicalName) return false;

                    const validForRead =
                        typeof a.IsValidForRead === 'boolean'
                            ? a.IsValidForRead
                            : a.IsValidForRead?.Value;
                    const validForSearch =
                        typeof a.IsValidForAdvancedFind === 'boolean'
                            ? a.IsValidForAdvancedFind
                            : a.IsValidForAdvancedFind?.Value;
                    const isLogical =
                        typeof a.IsLogical === 'boolean'
                            ? a.IsLogical
                            : a.IsLogical?.Value;

                    if (validForRead === false || validForSearch === false || isLogical === true) {
                        return false;
                    }

                    return true;
                })
                .map((a: any) => {
                    const typeName =
                        String(
                            a?.AttributeTypeName?.Value ||
                            a?.AttributeType ||
                            ''
                        ).toLowerCase();
                    const label =
                        a?.DisplayName?.UserLocalizedLabel?.Label ||
                        a?.DisplayName?.LocalizedLabels?.[0]?.Label ||
                        undefined;

                    return {
                        logicalName: String(a.LogicalName).toLowerCase(),
                        displayName: label,
                        attributeType: typeName || 'unknown'
                    } as ISearchableAttribute;
                })
                .sort((a: ISearchableAttribute, b: ISearchableAttribute) =>
                    (a.displayName || a.logicalName).localeCompare(b.displayName || b.logicalName)
                );

            this._searchableAttributesCache[entity] = rows;
            diag.info('Loaded searchable attributes', {
                entity,
                count: rows.length
            });
            return rows;
        } catch (error) {
            diag.error('Failed to load searchable attributes', error, { entity });
            return [];
        }
    }

    private async getReadableAttributeNames(entityLogicalName?: string): Promise<string[]> {
        const entity = (entityLogicalName || this._targetEntity || '').toLowerCase();
        if (!entity) {
            return [];
        }

        if (this._attributeNamesCache[entity]) {
            return this._attributeNamesCache[entity];
        }

        try {
            const encoded = entity.replace(/'/g, "''");
            const metadata = await this.fetchMetadata(
                `EntityDefinitions(LogicalName='${encoded}')?$select=LogicalName&$expand=Attributes($select=LogicalName,IsValidForRead)`
            );

            const attributes = Array.isArray(metadata?.Attributes) ? metadata.Attributes : [];
            const names = attributes
                .filter((a: any) => {
                    if (!a?.LogicalName) return false;

                    const validForRead =
                        typeof a.IsValidForRead === 'boolean'
                            ? a.IsValidForRead
                            : a.IsValidForRead?.Value;

                    return validForRead !== false;
                })
                .map((a: any) => String(a.LogicalName))
                .sort((a: string, b: string) => a.localeCompare(b));

            this._attributeNamesCache[entity] = names;
            diag.info("Loaded readable attribute names", { entity, count: names.length });
            return names;
        } catch (error) {
            diag.info("Failed to load readable attribute names", {
                entity,
                error: error instanceof Error ? error.message : String(error)
            });
            return [];
        }
    }

    private hydrateRowsWithAllAttributeKeys(rows: any[], attributeNames: string[]): any[] {
        if (!rows?.length || !attributeNames?.length) {
            return rows;
        }

        return rows.map((row) => {
            const hydrated: any = { ...row };
            for (const attr of attributeNames) {
                if (!(attr in hydrated)) {
                    hydrated[attr] = null;
                }
            }
            return hydrated;
        });
    }

    private normalizeAuditAttributeName(candidate?: string): string | undefined {
        const normalized = String(candidate || '').trim().toLowerCase();
        if (!normalized) {
            return undefined;
        }

        if (/^\d+$/.test(normalized)) {
            return undefined;
        }

        if (!/^[a-z_][a-z0-9_.]*$/.test(normalized)) {
            return undefined;
        }

        return normalized;
    }

    private normalizeAuditValue(value: unknown): string {
        if (value === null || value === undefined) {
            return '--';
        }

        if (typeof value === 'string') {
            const trimmed = value.trim();
            return trimmed.length > 0 ? trimmed : '--';
        }

        if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
            return String(value);
        }

        if (value instanceof Date) {
            return value.toISOString();
        }

        try {
            return JSON.stringify(value);
        } catch {
            return '--';
        }
    }

    private getObjectValueByCaseInsensitiveKeys(obj: any, keys: string[]): unknown {
        if (!obj || typeof obj !== 'object') {
            return undefined;
        }

        const objectKeys = Object.keys(obj);
        const match = objectKeys.find((k) => keys.includes(k.toLowerCase()));
        return match ? obj[match] : undefined;
    }

    private tryExtractChangesFromJson(input: string): IParsedAuditAttributeChange[] {
        try {
            const parsed = JSON.parse(input);
            const changes = new Map<string, IParsedAuditAttributeChange>();

            const upsert = (attributeRaw?: string, oldValue?: unknown, newValue?: unknown): void => {
                const attribute = this.normalizeAuditAttributeName(attributeRaw);
                if (!attribute) {
                    return;
                }

                const existing = changes.get(attribute) || { attribute };
                if (oldValue !== undefined && oldValue !== null) {
                    existing.oldValue = this.normalizeAuditValue(oldValue);
                }
                if (newValue !== undefined && newValue !== null) {
                    existing.newValue = this.normalizeAuditValue(newValue);
                }
                changes.set(attribute, existing);
            };

            const walk = (node: any): void => {
                if (node === null || node === undefined) {
                    return;
                }

                if (Array.isArray(node)) {
                    node.forEach(walk);
                    return;
                }

                if (typeof node === 'object') {
                    const attribute = this.getObjectValueByCaseInsensitiveKeys(node, ['attribute', 'name', 'logicalname', 'field']);
                    const oldValue = this.getObjectValueByCaseInsensitiveKeys(node, ['oldvalue', 'old', 'previousvalue', 'previous']);
                    const newValue = this.getObjectValueByCaseInsensitiveKeys(node, ['newvalue', 'new', 'value', 'currentvalue', 'current']);
                    if (typeof attribute === 'string') {
                        upsert(attribute, oldValue, newValue);
                    }

                    Object.keys(node).forEach((key) => walk(node[key]));
                    return;
                }
            };

            walk(parsed);
            return Array.from(changes.values());
        } catch {
            return [];
        }
    }

    private extractChangedAttributes(changedata?: string, attributemask?: string): IParsedAuditAttributeChange[] {
        const values = new Map<string, IParsedAuditAttributeChange>();

        const upsert = (candidate?: string, oldValue?: unknown, newValue?: unknown): void => {
            const normalized = this.normalizeAuditAttributeName(candidate);
            if (!normalized) {
                return;
            }

            const existing = values.get(normalized) || { attribute: normalized };
            if (oldValue !== undefined && oldValue !== null) {
                existing.oldValue = this.normalizeAuditValue(oldValue);
            }
            if (newValue !== undefined && newValue !== null) {
                existing.newValue = this.normalizeAuditValue(newValue);
            }
            values.set(normalized, existing);
        };

        const changed = String(changedata || '').trim();
        if (changed) {
            const jsonChanges = this.tryExtractChangesFromJson(changed);
            jsonChanges.forEach((entry) => upsert(entry.attribute, entry.oldValue, entry.newValue));

            try {
                const xmlDoc = new DOMParser().parseFromString(changed, 'text/xml');
                const hasParserError = xmlDoc.getElementsByTagName('parsererror').length > 0;
                if (!hasParserError) {
                    const elements = Array.from(xmlDoc.getElementsByTagName('*'));
                    elements.forEach((element) => {
                        const attribute =
                            element.getAttribute('name') ||
                            element.getAttribute('logicalname') ||
                            element.getAttribute('attribute') ||
                            element.getAttribute('field') ||
                            undefined;

                        if (!attribute) {
                            return;
                        }

                        const oldValue =
                            element.getAttribute('oldvalue') ||
                            element.getAttribute('old') ||
                            element.getElementsByTagName('oldvalue')[0]?.textContent ||
                            element.getElementsByTagName('old')[0]?.textContent ||
                            undefined;

                        const newValue =
                            element.getAttribute('newvalue') ||
                            element.getAttribute('new') ||
                            element.getAttribute('value') ||
                            element.getElementsByTagName('newvalue')[0]?.textContent ||
                            element.getElementsByTagName('new')[0]?.textContent ||
                            element.getElementsByTagName('value')[0]?.textContent ||
                            undefined;

                        upsert(attribute, oldValue, newValue);
                    });
                }
            } catch {
                // Ignore parser errors and fallback to regex extraction below.
            }

            const attributeRegex = /(?:name|logicalname|attribute|field)\s*=\s*["']([a-z_][a-z0-9_.]*)["']/gi;
            let match: RegExpExecArray | null = attributeRegex.exec(changed);
            while (match) {
                upsert(match[1]);
                match = attributeRegex.exec(changed);
            }
        }

        const mask = String(attributemask || '').trim();
        if (mask) {
            mask.split(/[;,\n|]/g)
                .map(token => token.trim())
                .forEach(token => upsert(token));
        }

        return Array.from(values.values())
            .sort((a, b) => a.attribute.localeCompare(b.attribute));
    }

    private isRetainOrDeleteAuditEvent(operation?: unknown, action?: unknown): boolean {
        const op = this.normalizeAuditValue(operation).trim().toLowerCase();
        const act = this.normalizeAuditValue(action).trim().toLowerCase();
        const combined = `${op} ${act}`;

        return (
            combined.includes('delete') ||
            combined.includes('retain') ||
            combined.includes('retention')
        );
    }

    private ensureRetainedFetch(fetchXml: string): string {
        // Inject datasource="retained" on the root fetch for archive pulls.
        if (!fetchXml) return fetchXml;
        const alreadyTagged = /<fetch[^>]*datasource\s*=\s*"retained"/i.test(fetchXml);
        if (alreadyTagged) return fetchXml;
        const updated = fetchXml.replace(/<fetch\b([^>]*)>/i, (_match, attrs) => `<fetch${attrs} datasource="retained">`);
        return updated || fetchXml;
    }

    private buildRelatedFetch(relationship: IRelatedRelationship, parentId: string, maxRows: number, attributeNames: string[]): string {
        const id = parentId.replace(/[{}]/g, "");
        const projection = attributeNames.length > 0
            ? attributeNames.map(a => `<attribute name="${a}" />`).join("")
            : `<all-attributes />`;

        return `<fetch version="1.0" mapping="logical" top="${Math.max(1, maxRows)}">
            <entity name="${relationship.childEntity}">
                ${projection}
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

            const filteredLogicalNames = logicalNames.filter((name) => !this.isInternalRetentionEntity(name));
            const excluded = logicalNames.filter((name) => this.isInternalRetentionEntity(name));
            if (excluded.length > 0) {
                diag.info('Excluded internal retention entities from Select Entity options', {
                    count: excluded.length,
                    sample: excluded.slice(0, 10)
                });
            }

            if (filteredLogicalNames.length === 0) {
                diag.info("No active retentionconfigs found; falling back to metadata flags");
                throw new Error("NoActiveRetentionConfigs");
            }

            const checks = await Promise.all(filteredLogicalNames.map(async (logicalName) => {
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
                    .filter((r: any) => {
                        if (!r?.LogicalName || r?.[property] !== true) {
                            return false;
                        }

                        const logicalName = String(r.LogicalName).toLowerCase();
                        return !this.isInternalRetentionEntity(logicalName);
                    })
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

    private ensurePrimaryIdAttribute(fetchXml: string, primaryIdAttribute: string): string {
        if (!fetchXml) return fetchXml;
        const primaryId = String(primaryIdAttribute || '').toLowerCase().trim() || `${this._targetEntity}id`;
        const hasPrimaryId = new RegExp(`<attribute\\s+name=["']${primaryId}["']`, "i").test(fetchXml);
        if (hasPrimaryId) return fetchXml;

        const entityOpenTag = new RegExp(`(<entity\\s+name=["']${this._targetEntity}["'][^>]*>)`, "i");
        if (entityOpenTag.test(fetchXml)) {
            return fetchXml.replace(entityOpenTag, `$1<attribute name="${primaryId}" />`);
        }

        return fetchXml;
    }

    private extractMissingAttributeFromError(error: unknown): string | undefined {
        const raw = String((error as any)?.message || error || '').toLowerCase();
        if (!raw) {
            return undefined;
        }

        const patterns = [
            /doesn't contain attribute\s+'([a-z0-9_]+)'/i,
            /does not contain attribute\s+'([a-z0-9_]+)'/i,
            /could not find a property named\s+'([a-z0-9_]+)'/i,
            /attribute\s+'([a-z0-9_]+)'\s+was not found/i
        ];

        for (const pattern of patterns) {
            const match = pattern.exec(raw);
            if (match?.[1]) {
                return String(match[1]).toLowerCase();
            }
        }

        return undefined;
    }

    private async retrieveAllPages(entity: string, effectiveFetch: string, maxRows: number): Promise<any[]> {
        const pageSize = Math.min(Math.max(maxRows, 1), 5000);
        let result = await this._context.webAPI.retrieveMultipleRecords(entity, `?fetchXml=${encodeURIComponent(effectiveFetch)}`, pageSize);
        const allRows = [...(result.entities || [])];

        let nextLink = (result as any).nextLink || (result as any)["@odata.nextLink"];
        while (nextLink && allRows.length < maxRows) {
            const remaining = maxRows - allRows.length;
            const nextOptions = typeof nextLink === "string" && nextLink.includes("?")
                ? `?${nextLink.split("?")[1]}`
                : nextLink;

            result = await this._context.webAPI.retrieveMultipleRecords(
                entity,
                nextOptions,
                Math.min(remaining, 5000)
            );

            allRows.push(...(result.entities || []));
            nextLink = (result as any).nextLink || (result as any)["@odata.nextLink"];
        }

        return allRows.slice(0, maxRows);
    }

    private removeAttributeFromFetch(fetchXml: string, attributeName: string): string {
        if (!fetchXml || !attributeName) {
            return fetchXml;
        }

        const target = attributeName.toLowerCase().trim();
        if (!target) {
            return fetchXml;
        }

        try {
            const parser = new DOMParser();
            const doc = parser.parseFromString(fetchXml, "text/xml");
            const parseError = doc.getElementsByTagName("parsererror");
            if (parseError && parseError.length > 0) {
                throw new Error("Invalid FetchXML parser result");
            }

            const removeByTagAndAttribute = (tagName: string, attrName: string): number => {
                const nodes = Array.from(doc.getElementsByTagName(tagName));
                let removed = 0;
                for (let i = nodes.length - 1; i >= 0; i--) {
                    const node = nodes[i];
                    const value = String(node.getAttribute(attrName) || "").toLowerCase();
                    if (value === target && node.parentNode) {
                        node.parentNode.removeChild(node);
                        removed++;
                    }
                }
                return removed;
            };

            const removedAttributes = removeByTagAndAttribute("attribute", "name");
            const removedConditions = removeByTagAndAttribute("condition", "attribute");
            const removedOrders = removeByTagAndAttribute("order", "attribute");

            const filters = Array.from(doc.getElementsByTagName("filter"));
            for (let i = filters.length - 1; i >= 0; i--) {
                const filter = filters[i];
                const hasElementChildren = Array.from(filter.childNodes).some((n: any) => n.nodeType === 1);
                if (!hasElementChildren && filter.parentNode) {
                    filter.parentNode.removeChild(filter);
                }
            }

            const serializer = new XMLSerializer();
            const sanitized = serializer.serializeToString(doc);
            diag.info("Removed failing attribute references from FetchXML", {
                entity: this._targetEntity,
                attribute: target,
                removedAttributes,
                removedConditions,
                removedOrders
            });
            return sanitized;
        } catch {
            const escaped = target.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
            let sanitized = fetchXml;
            sanitized = sanitized.replace(new RegExp(`<attribute\\b[^>]*\\bname=["']${escaped}["'][^>]*/>`, "gi"), "");
            sanitized = sanitized.replace(new RegExp(`<condition\\b[^>]*\\battribute=["']${escaped}["'][^>]*/>`, "gi"), "");
            sanitized = sanitized.replace(new RegExp(`<order\\b[^>]*\\battribute=["']${escaped}["'][^>]*/>`, "gi"), "");
            return sanitized;
        }
    }

    private expandFetchToExplicitColumns(fetchXml: string, attributeNames: string[]): string {
        if (!fetchXml) return fetchXml;
        if (!attributeNames || attributeNames.length === 0) {
            // Fallback behavior if metadata attributes are unavailable.
            return fetchXml.replace(/(<entity\b[^>]*>)/i, "$1<all-attributes />");
        }

        try {
            const parser = new DOMParser();
            const doc = parser.parseFromString(fetchXml, "text/xml");
            const parseError = doc.getElementsByTagName("parsererror");
            if (parseError && parseError.length > 0) {
                throw new Error("Invalid FetchXML parser result");
            }

            const entity = doc.getElementsByTagName("entity")[0];
            if (!entity) {
                return fetchXml;
            }

            // Replace only root entity projection with all-attributes.
            // Keep filters, orders, links, and conditions from the selected view.
            const projectionNodes = Array.from(entity.childNodes).filter((node: any) => {
                const name = (node.nodeName || "").toLowerCase();
                return name === "attribute" || name === "all-attributes";
            });
            projectionNodes.forEach((node: any) => entity.removeChild(node));

            const fragment = doc.createDocumentFragment();
            attributeNames.forEach((attr) => {
                const node = doc.createElement("attribute");
                node.setAttribute("name", attr);
                fragment.appendChild(node);
            });

            const firstElementChild = Array.from(entity.childNodes).find((n: any) => n.nodeType === 1) as Node | undefined;
            if (firstElementChild) {
                entity.insertBefore(fragment, firstElementChild);
            } else {
                entity.appendChild(fragment);
            }

            const serializer = new XMLSerializer();
            return serializer.serializeToString(doc);
        } catch {
            // Regex fallback if XML parser is unavailable in host context.
            const withoutAll = fetchXml.replace(/<all-attributes\s*\/?>(?:<\/all-attributes>)?/gi, "");
            const withoutAttributes = withoutAll.replace(/<attribute\s+name=["'][^"']+["']\s*\/>/gi, "");
            const explicit = attributeNames.map(a => `<attribute name="${a}" />`).join("");
            return withoutAttributes.replace(/(<entity\b[^>]*>)/i, `$1${explicit}`);
        }
    }

    private sanitizeFetchForRetainedStore(fetchXml: string, validAttributes: string[]): string {
        if (!fetchXml) {
            return fetchXml;
        }

        const targetEntity = (this._targetEntity || "").toLowerCase();
        const validAttributeSet = new Set((validAttributes || []).map(a => a.toLowerCase()));

        try {
            const parser = new DOMParser();
            const doc = parser.parseFromString(fetchXml, "text/xml");
            const parseError = doc.getElementsByTagName("parsererror");
            if (parseError && parseError.length > 0) {
                throw new Error("Invalid FetchXML parser result");
            }

            const entity = doc.getElementsByTagName("entity")[0];
            if (!entity) {
                return fetchXml;
            }

            let removedLinkEntities = 0;
            let removedConditions = 0;
            let removedOrders = 0;
            const removedConditionAttributes: string[] = [];
            const removedOrderAttributes: string[] = [];

            const linkEntities = Array.from(entity.getElementsByTagName("link-entity"));
            for (let i = linkEntities.length - 1; i >= 0; i--) {
                const node = linkEntities[i];
                if (node.parentNode) {
                    node.parentNode.removeChild(node);
                    removedLinkEntities++;
                }
            }

            const conditions = Array.from(entity.getElementsByTagName("condition"));
            for (const condition of conditions) {
                const parentNode = condition.parentNode;
                if (!parentNode) {
                    continue;
                }

                const conditionEntityName = (condition.getAttribute("entityname") || "").toLowerCase();
                const conditionAttribute = (condition.getAttribute("attribute") || "").toLowerCase();

                const crossEntityCondition = !!conditionEntityName && conditionEntityName !== targetEntity;
                const aliasedCondition = conditionAttribute.includes(".");
                const invalidAttributeCondition = !!conditionAttribute && validAttributeSet.size > 0 && !validAttributeSet.has(conditionAttribute);

                if (crossEntityCondition || aliasedCondition || invalidAttributeCondition) {
                    if (conditionAttribute) {
                        removedConditionAttributes.push(conditionAttribute);
                    }
                    parentNode.removeChild(condition);
                    removedConditions++;
                }
            }

            const orders = Array.from(entity.getElementsByTagName("order"));
            for (const order of orders) {
                const parentNode = order.parentNode;
                if (!parentNode) {
                    continue;
                }

                const orderEntityName = (order.getAttribute("entityname") || "").toLowerCase();
                const orderAttribute = (order.getAttribute("attribute") || "").toLowerCase();

                const crossEntityOrder = !!orderEntityName && orderEntityName !== targetEntity;
                const aliasedOrder = orderAttribute.includes(".");
                const invalidAttributeOrder = !!orderAttribute && validAttributeSet.size > 0 && !validAttributeSet.has(orderAttribute);

                if (crossEntityOrder || aliasedOrder || invalidAttributeOrder) {
                    if (orderAttribute) {
                        removedOrderAttributes.push(orderAttribute);
                    }
                    parentNode.removeChild(order);
                    removedOrders++;
                }
            }

            const filters = Array.from(entity.getElementsByTagName("filter"));
            for (let i = filters.length - 1; i >= 0; i--) {
                const filter = filters[i];
                const hasElementChildren = Array.from(filter.childNodes).some((n: any) => n.nodeType === 1);
                if (!hasElementChildren && filter.parentNode) {
                    filter.parentNode.removeChild(filter);
                }
            }

            const serializer = new XMLSerializer();
            const sanitizedXml = serializer.serializeToString(doc);
            diag.info("Retained FetchXML sanitizer output", {
                entity: this._targetEntity,
                removedLinkEntities,
                removedConditions,
                removedOrders,
                removedConditionAttributes: Array.from(new Set(removedConditionAttributes)).sort(),
                removedOrderAttributes: Array.from(new Set(removedOrderAttributes)).sort(),
                validAttributeCount: validAttributeSet.size,
                sanitizedFetchXml: sanitizedXml
            });
            return sanitizedXml;
        } catch {
            let sanitized = fetchXml;
            sanitized = sanitized.replace(/<link-entity\b[\s\S]*?<\/link-entity>/gi, "");
            sanitized = sanitized.replace(/<condition\b[^>]*\bentityname=["'][^"']+["'][^>]*\/>/gi, "");
            sanitized = sanitized.replace(/<condition\b[^>]*\battribute=["'][^"']*\.[^"']*["'][^>]*\/>/gi, "");
            sanitized = sanitized.replace(/<order\b[^>]*\bentityname=["'][^"']+["'][^>]*\/>/gi, "");
            sanitized = sanitized.replace(/<order\b[^>]*\battribute=["'][^"']*\.[^"']*["'][^>]*\/>/gi, "");
            diag.info("Retained FetchXML sanitizer fallback output", {
                entity: this._targetEntity,
                validAttributeCount: validAttributeSet.size,
                sanitizedFetchXml: sanitized
            });
            return sanitized;
        }
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

            const mainForms = (result.entities || []).filter((e: any) => Number(e.type) === 2);

            const forms = mainForms.map(e => ({
                id: e.formid,
                name: e.name,
                formXml: e.formxml
            }));
            diag.info("Fetched system forms", {
                count: forms.length,
                totalRetrieved: result.entities?.length || 0,
                filteredToMain: true
            });
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
            const entityMetadata = await this.getEntityMetadata(this._targetEntity);
            const readableAttributeNames = await this.getReadableAttributeNames(this._targetEntity);
            const primaryIdAttribute = entityMetadata?.PrimaryIdAttribute || `${this._targetEntity}id`;

            let workingAttributes = readableAttributeNames.slice();
            if (primaryIdAttribute && !workingAttributes.includes(primaryIdAttribute)) {
                workingAttributes.push(primaryIdAttribute);
            }

            let workingFetchXml = fetchXml;

            let allRows: any[] = [];
            let lastError: unknown = undefined;
            let diagnosticsSnapshot: any = undefined;

            for (let attempt = 1; attempt <= MAX_LTR_FETCH_ATTEMPTS; attempt++) {
                const expanded = this.expandFetchToExplicitColumns(workingFetchXml, workingAttributes);
                const withPrimaryId = this.ensurePrimaryIdAttribute(expanded, primaryIdAttribute);
                const effectiveFetch = isArchive
                    ? this.ensureRetainedFetch(this.sanitizeFetchForRetainedStore(withPrimaryId, workingAttributes))
                    : withPrimaryId;

                diagnosticsSnapshot = {
                    entity: this._targetEntity,
                    isArchive,
                    attempt,
                    maxAttempts: MAX_LTR_FETCH_ATTEMPTS,
                    readableAttributeCount: readableAttributeNames.length,
                    workingAttributeCount: workingAttributes.length,
                    primaryIdAttribute,
                    originalFetchXml: workingFetchXml,
                    expandedFetchXml: expanded,
                    fetchWithPrimaryId: withPrimaryId,
                    effectiveFetchXml: effectiveFetch
                };

                diag.info("LTR FetchXML diagnostics", diagnosticsSnapshot);

                try {
                    allRows = await this.retrieveAllPages(this._targetEntity, effectiveFetch, maxRows);
                    lastError = undefined;
                    break;
                } catch (attemptError) {
                    lastError = attemptError;
                    const missingAttribute = this.extractMissingAttributeFromError(attemptError);

                    if (missingAttribute && workingAttributes.includes(missingAttribute)) {
                        workingAttributes = workingAttributes.filter(a => a !== missingAttribute);
                        workingFetchXml = this.removeAttributeFromFetch(workingFetchXml, missingAttribute);
                        diag.info("Retrying LTR fetch after removing missing attribute from projection", {
                            entity: this._targetEntity,
                            attempt,
                            missingAttribute,
                            remainingAttributeCount: workingAttributes.length
                        });
                        continue;
                    }

                    if (missingAttribute) {
                        workingFetchXml = this.removeAttributeFromFetch(workingFetchXml, missingAttribute);
                        diag.info("Retrying LTR fetch after removing missing attribute from fetch clauses", {
                            entity: this._targetEntity,
                            attempt,
                            missingAttribute,
                            remainingAttributeCount: workingAttributes.length
                        });
                        continue;
                    }

                    throw attemptError;
                }
            }

            if (lastError) {
                throw lastError;
            }
            // NOTE: If specific API is needed for LTR, replace this logic.
            // Some LTR implementations use a custom message or specific headers.
            // Assuming the fetchXml provided by the View is sufficient or needs modification.

            // If isArchive is true, we might need to modify the FetchXML to target the retention store
            // or add a header 'x-ms-retention-search': 'true' if supported by standard API.

            // Note: PCF context.webAPI.retrieveMultipleRecords doesn't easily support raw FetchXML with custom headers
            // in all versions. We might need specific implementation.

            // For standard FetchXML usage:
            const capped = allRows.slice(0, maxRows);
            const hydrated = this.hydrateRowsWithAllAttributeKeys(capped, readableAttributeNames);

            diag.info("Fetched LTR data", {
                count: hydrated.length,
                isArchive,
                maxRows,
                hydratedAttributeCount: readableAttributeNames.length
            });
            return hydrated;
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
            const readableAttributeNames = await this.getReadableAttributeNames(relationship.childEntity);
            const childEntityMetadata = await this.getEntityMetadata(relationship.childEntity);
            const childPrimaryId = childEntityMetadata?.PrimaryIdAttribute || `${relationship.childEntity}id`;
            const lookupAttribute = String(relationship.childLookupAttribute || '').toLowerCase();

            let workingAttributes = readableAttributeNames.slice();
            if (childPrimaryId && !workingAttributes.includes(childPrimaryId)) {
                workingAttributes.push(childPrimaryId);
            }
            if (lookupAttribute && !workingAttributes.includes(lookupAttribute)) {
                workingAttributes.push(lookupAttribute);
            }

            diag.info("Fetching related records", {
                relationship: relationship.schemaName,
                childEntity: relationship.childEntity,
                parentId,
                isArchive,
                maxRows
            });

            let rows: any[] = [];
            let lastError: unknown = undefined;

            for (let attempt = 1; attempt <= MAX_LTR_FETCH_ATTEMPTS; attempt++) {
                const fetchXml = this.buildRelatedFetch(relationship, parentId, maxRows, workingAttributes);
                const effectiveFetch = isArchive ? this.ensureRetainedFetch(fetchXml) : fetchXml;

                try {
                    rows = await this.retrieveAllPages(relationship.childEntity, effectiveFetch, Math.min(Math.max(maxRows, 1), 5000));
                    lastError = undefined;
                    break;
                } catch (attemptError) {
                    lastError = attemptError;
                    const missingAttribute = this.extractMissingAttributeFromError(attemptError);

                    if (!missingAttribute) {
                        throw attemptError;
                    }

                    if (lookupAttribute && missingAttribute === lookupAttribute) {
                        diag.info("Related fetch lookup attribute missing in this environment; skipping relationship", {
                            relationship: relationship.schemaName,
                            childEntity: relationship.childEntity,
                            lookupAttribute,
                            attempt
                        });
                        rows = [];
                        lastError = undefined;
                        break;
                    }

                    if (workingAttributes.includes(missingAttribute)) {
                        workingAttributes = workingAttributes.filter(a => a !== missingAttribute);
                        diag.info("Retrying related fetch after removing missing projection attribute", {
                            relationship: relationship.schemaName,
                            childEntity: relationship.childEntity,
                            missingAttribute,
                            attempt,
                            remainingAttributeCount: workingAttributes.length
                        });
                        continue;
                    }

                    throw attemptError;
                }
            }

            if (lastError) {
                throw lastError;
            }

            const hydrated = this.hydrateRowsWithAllAttributeKeys(rows || [], readableAttributeNames);
            diag.info("Fetched related records", {
                relationship: relationship.schemaName,
                childEntity: relationship.childEntity,
                count: hydrated.length,
                hydratedAttributeCount: readableAttributeNames.length
            });
            return hydrated;
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

    public async getRecordAuditHistory(recordId: string, maxRows: number = 200): Promise<IAuditHistoryItem[]> {
        try {
            const id = String(recordId || '').replace(/[{}]/g, '').toLowerCase();
            if (!id) {
                return [];
            }

            const top = Math.min(Math.max(maxRows, 1), 5000);
            const query =
                `?$select=auditid,createdon,action,operation,attributemask,changedata,_userid_value` +
                `&$filter=_objectid_value eq ${id}` +
                `&$orderby=createdon asc`;

            const result = await this._context.webAPI.retrieveMultipleRecords('audit', query, top);
            const rows = Array.isArray(result?.entities) ? result.entities : [];

            const mapped: IAuditHistoryItem[] = [];
            rows.forEach((row: any) => {
                const changedBy =
                    row?.['_userid_value@OData.Community.Display.V1.FormattedValue'] ||
                    row?.['userid@OData.Community.Display.V1.FormattedValue'] ||
                    row?._userid_value ||
                    'Unknown';

                const operation = row?.['operation@OData.Community.Display.V1.FormattedValue'] || row?.operation;
                const action = row?.['action@OData.Community.Display.V1.FormattedValue'] || row?.action;
                const isRetainDeleteEvent = this.isRetainOrDeleteAuditEvent(operation, action);
                const attributes = isRetainDeleteEvent
                    ? []
                    : this.extractChangedAttributes(row?.changedata, row?.attributemask);

                const baseId = String(row?.auditid || `${row?.createdon || ''}|${changedBy}`);
                    if (attributes.length === 0) {
                        mapped.push({
                            id: `${baseId}|__event__`,
                            eventKey: baseId,
                            createdOn: row?.createdon,
                            changedBy: String(changedBy),
                        attribute: '--',
                            oldValue: '--',
                            newValue: '--',
                            operation: operation !== undefined && operation !== null ? String(operation) : undefined,
                            action: action !== undefined && action !== null ? String(action) : undefined
                        });
                        return;
                    }

                attributes.forEach((attribute) => {
                    mapped.push({
                        id: `${baseId}|${attribute.attribute}`,
                        eventKey: baseId,
                        createdOn: row?.createdon,
                        changedBy: String(changedBy),
                        attribute: attribute.attribute,
                        oldValue: attribute.oldValue || '--',
                        newValue: attribute.newValue || '--',
                        operation: operation !== undefined && operation !== null ? String(operation) : undefined,
                        action: action !== undefined && action !== null ? String(action) : undefined
                    });
                });
            });

            diag.info('Fetched audit history', {
                entity: this._targetEntity,
                recordId: id,
                auditEventCount: rows.length,
                changedAttributeCount: mapped.length
            });

            return mapped;
        } catch (error) {
            diag.error('Error fetching audit history', error, { entity: this._targetEntity, recordId });
            return [];
        }
    }

    /**
     * Fetch a single record's details
     */
    public async getRecordDetails(id: string, isArchive: boolean = false): Promise<any> {
        try {
            if (isArchive) {
                                const normalizedId = String(id || '').replace(/[{}]/g, '').toLowerCase();
                                const readableAttributeNames = await this.getReadableAttributeNames(this._targetEntity);
                                const projection = readableAttributeNames.length > 0
                                        ? readableAttributeNames.map(a => `<attribute name="${a}" />`).join("")
                                        : `<all-attributes />`;

                                const fetchXml = `<fetch version="1.0" output-format="xml-platform" mapping="logical" distinct="false" datasource="retained" top="1">
                                    <entity name="${this._targetEntity}">
                                        ${projection}
                                        <filter type="and">
                                            <condition attribute="${this._targetEntity}id" operator="eq" value="${normalizedId}" />
                                        </filter>
                                    </entity>
                                </fetch>`;

                                const result = await this._context.webAPI.retrieveMultipleRecords(this._targetEntity, `?fetchXml=${encodeURIComponent(fetchXml)}`, 1);
                                const hydrated = this.hydrateRowsWithAllAttributeKeys(result.entities || [], readableAttributeNames);
                                const record = hydrated.length > 0 ? hydrated[0] : null;
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
