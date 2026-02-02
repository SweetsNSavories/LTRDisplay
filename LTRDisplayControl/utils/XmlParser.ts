import { XMLParser } from "fast-xml-parser";

export interface IGridColumn {
    name: string;
    width: number;
    displayName: string; // derived or looked up
    alias?: string;
}

export interface IFormTab {
    name: string;
    id: string;
    label: string;
    sections: IFormSection[];
    visible: boolean;
}

export interface IFormSection {
    name: string;
    id: string;
    label: string;
    rows: IFormRow[];
    visible: boolean;
}

export interface IFormRow {
    cells: IFormCell[];
}

export interface IFormCell {
    id: string;
    controlId: string;
    fieldName: string; // datafieldname
    label: string;
    visible: boolean;
    rowSpan: number;
    colSpan: number;
}

export class XmlParserHelper {
    private static parser = new XMLParser({
        ignoreAttributes: false,
        attributeNamePrefix: "@_"
    });

    /**
     * Parses View Layout XML to extract columns
     * <grid name="resultset" ...><row name="result" ...><cell name="title" width="300" /> ...
     */
    public static parseLayoutXml(layoutXml: string): IGridColumn[] {
        if (!layoutXml) return [];

        try {
            const result = this.parser.parse(layoutXml);
            const cells = result.grid?.row?.cell;

            if (!cells) return [];

            // Handle single cell or array of cells
            const cellArray = Array.isArray(cells) ? cells : [cells];

            return cellArray.map((c: any) => ({
                name: c["@_name"],
                width: parseInt(c["@_width"] || "100"),
                displayName: c["@_name"] // Placeholder, real display name needs Entity Metadata
            }));
        } catch (e) {
            console.error("Error parsing Layout XML", e);
            return [];
        }
    }

    /**
     * Parses SystemForm XML
     */
    public static parseFormXml(formXml: string): IFormTab[] {
        if (!formXml) return [];

        try {
            const result = this.parser.parse(formXml);
            // Structure: form -> tabs -> tab
            const tabsRoot = result.form?.tabs?.tab;
            if (!tabsRoot) return [];

            const tabsArray = Array.isArray(tabsRoot) ? tabsRoot : [tabsRoot];

            return tabsArray.map((t: any) => {
                return {
                    name: t["@_name"],
                    id: t["@_id"],
                    label: t.labels?.label?.["@_description"] || t["@_name"], // Simplify label fetch
                    visible: t["@_visible"] !== "false",
                    sections: this.parseSections(t.columns?.column) // Form XML structure varies, but usually tabs -> columns -> sections
                };
            });

        } catch (e) {
            console.error("Error parsing Form XML", e);
            return [];
        }
    }

    private static parseSections(columnsCtx: any): IFormSection[] {
        if (!columnsCtx) return [];

        // In FormXML, a tab has columns (usually 2 or 3), containing sections
        const columns = Array.isArray(columnsCtx) ? columnsCtx : [columnsCtx];
        let sections: IFormSection[] = [];

        columns.forEach((col: any) => {
            const secs = col.sections?.section;
            if (secs) {
                const secArray = Array.isArray(secs) ? secs : [secs];
                sections = sections.concat(secArray.map((s: any) => ({
                    name: s["@_name"],
                    id: s["@_id"],
                    label: s.labels?.label?.["@_description"] || s["@_name"] || "Section",
                    visible: s["@_visible"] !== "false",
                    rows: this.parseRows(s.rows?.row)
                })));
            }
        });

        return sections;
    }

    private static parseRows(rowsCtx: any): IFormRow[] {
        if (!rowsCtx) return [];
        const rowsArray = Array.isArray(rowsCtx) ? rowsCtx : [rowsCtx];

        return rowsArray.map((r: any) => ({
            cells: this.parseCells(r.cell)
        }));
    }

    private static parseCells(cellsCtx: any): IFormCell[] {
        if (!cellsCtx) return [];
        const cellsArray = Array.isArray(cellsCtx) ? cellsCtx : [cellsCtx];

        return cellsArray.map((c: any) => ({
            id: c["@_id"],
            controlId: c.control?.["@_id"],
            fieldName: c.control?.["@_datafieldname"],
            label: c.labels?.label?.["@_description"] || c.control?.["@_datafieldname"],
            visible: c["@_visible"] !== "false",
            rowSpan: parseInt(c["@_rowspan"] || "1"),
            colSpan: parseInt(c["@_colspan"] || "1")
        })).filter(c => c.fieldName); // Only keep bound fields for now
    }
}
