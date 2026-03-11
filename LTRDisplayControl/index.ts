/// <reference path="./generated/ManifestTypes.d.ts" />
import { IInputs, IOutputs } from "./generated/ManifestTypes";
import * as React from "react";
import { createRoot, Root } from "react-dom/client";
import App from "./components/App";

export class LTRDisplayControl implements ComponentFramework.StandardControl<IInputs, IOutputs> {
    private _notifyOutputChanged: () => void;
    private _container: HTMLDivElement;
    private _context: ComponentFramework.Context<IInputs>;
    private _root: Root | null = null;

    constructor() { }

    public init(context: ComponentFramework.Context<IInputs>, notifyOutputChanged: () => void, state: ComponentFramework.Dictionary, container: HTMLDivElement): void {
        this._context = context;
        this._notifyOutputChanged = notifyOutputChanged;
        this._container = container;
        this._root = createRoot(this._container);

        this.renderControl(context);
    }

    public updateView(context: ComponentFramework.Context<IInputs>): void {
        this._context = context;
        this.renderControl(context);
    }

    private renderControl(context: ComponentFramework.Context<IInputs>): void {
        const targetEntity = context.parameters.targetEntity.raw || "";
        const isArchive = context.parameters.isArchive.raw === true;
        const ltrEntities = context.parameters.ltrEntities?.raw || "";

        this._root?.render(
            React.createElement(App, {
                context: context,
                targetEntity: targetEntity,
                isArchive: isArchive,
                ltrEntities
            })
        );
    }

    public getOutputs(): IOutputs {
        return {};
    }

    public destroy(): void {
        this._root?.unmount();
        this._root = null;
    }
}
