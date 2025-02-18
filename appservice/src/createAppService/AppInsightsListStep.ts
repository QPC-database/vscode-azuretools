/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ApplicationInsightsManagementClient } from "@azure/arm-appinsights";
import { ApplicationInsightsComponent, ApplicationInsightsComponentListResult } from "@azure/arm-appinsights/esm/models";
import { AzureWizardPromptStep, IAzureNamingRules, IAzureQuickPickItem, IAzureQuickPickOptions, IWizardOptions, LocationListStep } from "vscode-azureextensionui";
import { localize } from "../localize";
import { createAppInsightsClient } from "../utils/azureClients";
import { nonNullProp } from "../utils/nonNull";
import { AppInsightsCreateStep } from "./AppInsightsCreateStep";
import { AppInsightsNameStep } from "./AppInsightsNameStep";
import { IAppServiceWizardContext } from "./IAppServiceWizardContext";

export const appInsightsNamingRules: IAzureNamingRules = {
    minLength: 1,
    maxLength: 255,
    invalidCharsRegExp: /[^a-zA-Z0-9\.\_\-\(\)]/
};

const skipForNowLabel: string = '$(clock) Skip for now';

export class AppInsightsListStep extends AzureWizardPromptStep<IAppServiceWizardContext> {
    private _suppressCreate: boolean | undefined;

    public constructor(suppressCreate?: boolean) {
        super();
        this._suppressCreate = suppressCreate;
    }

    public static async getAppInsightsComponents(wizardContext: IAppServiceWizardContext): Promise<ApplicationInsightsComponentListResult> {
        if (wizardContext.appInsightsTask === undefined) {
            const client: ApplicationInsightsManagementClient = await createAppInsightsClient(wizardContext);
            wizardContext.appInsightsTask = client.components.list();
        }

        return await wizardContext.appInsightsTask;
    }

    public async prompt(wizardContext: IAppServiceWizardContext): Promise<void> {
        const options: IAzureQuickPickOptions = { placeHolder: 'Select an Application Insights resource for your app.', id: `AppInsightsListStep/${wizardContext.subscriptionId}` };
        const input: IAzureQuickPickItem<ApplicationInsightsComponent | undefined> = (await wizardContext.ui.showQuickPick(this.getQuickPicks(wizardContext), options));
        wizardContext.appInsightsComponent = input.data;

        // as create new and skipForNow both have undefined as the data type, check the label
        if (input.label === skipForNowLabel) {
            wizardContext.telemetry.properties.aiSkipForNow = 'true';
            wizardContext.appInsightsSkip = true;
        } else {
            wizardContext.telemetry.properties.newAI = String(!wizardContext.appInsightsComponent);
        }
    }

    public shouldPrompt(wizardContext: IAppServiceWizardContext): boolean {
        return !wizardContext.appInsightsComponent;
    }

    public async getSubWizard(wizardContext: IAppServiceWizardContext): Promise<IWizardOptions<IAppServiceWizardContext> | undefined> {
        if (wizardContext.appInsightsComponent) {
            wizardContext.valuesToMask.push(nonNullProp(wizardContext.appInsightsComponent, 'name'));
        } else if (!wizardContext.appInsightsSkip) {
            const promptSteps: AzureWizardPromptStep<IAppServiceWizardContext>[] = [new AppInsightsNameStep()];
            LocationListStep.addStep(wizardContext, promptSteps);
            return {
                promptSteps: promptSteps,
                executeSteps: [new AppInsightsCreateStep()]
            };
        }

        return undefined;
    }

    private async getQuickPicks(wizardContext: IAppServiceWizardContext): Promise<IAzureQuickPickItem<ApplicationInsightsComponent | undefined>[]> {

        const picks: IAzureQuickPickItem<ApplicationInsightsComponent | undefined>[] = !this._suppressCreate ? [{
            label: localize('newApplicationInsight', '$(plus) Create new Application Insights resource'),
            data: undefined
        }] : [];

        picks.push({
            label: localize('skipForNow', skipForNowLabel),
            data: undefined
        });

        let components: ApplicationInsightsComponentListResult = await AppInsightsListStep.getAppInsightsComponents(wizardContext);

        // https://github.com/microsoft/vscode-azurefunctions/issues/1454
        if (!Array.isArray(components)) {
            components = [];
        }

        return picks.concat(components.map((ai: ApplicationInsightsComponent) => {
            return {
                id: ai.id,
                label: nonNullProp(ai, 'name'),
                description: ai.location,
                data: ai
            };
        }));
    }
}
