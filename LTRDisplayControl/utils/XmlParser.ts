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
    columns: IFormTabColumn[];
    sections: IFormSection[];
    visible: boolean;
}

export interface IFormTabColumn {
    id: string;
    name: string;
    width: number;
    sections: IFormSection[];
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
                const columns = this.parseColumns(t.columns?.column);
                return {
                    name: t["@_name"],
                    id: t["@_id"],
                    label: this.getLabel(t.labels?.label, t["@_name"]),
                    visible: t["@_visible"] !== "false",
                    columns,
                    sections: columns.flatMap((c: IFormTabColumn) => c.sections)
                };
            });

        } catch (e) {
            console.error("Error parsing Form XML", e);
            return [];
        }
    }

    private static getLabel(labelNode: any, fallback: string): string {
        if (!labelNode) return fallback;
        if (Array.isArray(labelNode)) {
            return labelNode[0]?.["@_description"] || fallback;
        }
        return labelNode["@_description"] || fallback;
    }

    private static parseColumns(columnsCtx: any): IFormTabColumn[] {
        if (!columnsCtx) return [];

        const columns = Array.isArray(columnsCtx) ? columnsCtx : [columnsCtx];
        return columns.map((col: any, index: number) => ({
            id: col["@_id"] || `${col["@_name"] || "column"}_${index}`,
            name: col["@_name"] || `column_${index + 1}`,
            width: parseInt(col["@_width"] || "0", 10) || 1,
            sections: this.parseSections(col.sections?.section)
        }));
    }

    private static parseSections(sectionsCtx: any): IFormSection[] {
        if (!sectionsCtx) return [];

        const secArray = Array.isArray(sectionsCtx) ? sectionsCtx : [sectionsCtx];
        return secArray.map((s: any) => ({
            name: s["@_name"],
            id: s["@_id"],
            label: this.getLabel(s.labels?.label, s["@_name"] || "Section"),
            visible: s["@_visible"] !== "false",
            rows: this.parseRows(s.rows?.row)
        }));
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
