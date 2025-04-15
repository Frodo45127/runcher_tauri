import { invoke } from "@tauri-apps/api/core";

interface LaunchOption {
    key: string;
    name: string;
    enabled: boolean;
    parameters: LaunchOptionParameter[];
    isScript: boolean;
    presets: string[];
}

interface LaunchOptionParameter {
    key: string;
    name: string;
    value: LaunchOptionValue;
    default: LaunchOptionValue;
}

type LaunchOptionValue =
    | { type: "Boolean"; value: boolean }
    | { type: "Number"; value: number }
    | { type: "Text"; value: string }
    | { type: "Select"; value: [string, string[]] };

export class LaunchOptionsPanel {
    private slidingPanel: HTMLElement;
    private content: HTMLElement;
    private openBtn: HTMLElement;
    private closeBtn: HTMLElement;
    private options: LaunchOption[] = [];

    constructor() {
        this.slidingPanel = document.getElementById('launch-options-panel') as HTMLElement;
        this.content = document.getElementById('launch-options-content') as HTMLElement;
        this.openBtn = document.getElementById('launch-options-btn') as HTMLElement;
        this.closeBtn = document.getElementById('launch-options-close-btn') as HTMLElement;

        this.openBtn.addEventListener('click', () => this.openPanel());
        this.closeBtn.addEventListener('click', () => this.closePanel());
    }

    public async loadOptions() {
        try {
            this.options = await invoke("get_launch_options");
            this.renderOptions();
        } catch (error) {
            console.error("Failed to load launch options:", error);
        }
    }

    private renderOptions() {
        console.log(this.options);
        this.content.innerHTML = '';

        this.options.forEach((option, index) => {
            const optionDiv = document.createElement('div');
            optionDiv.className = 'launch-option';

            // Create checkbox and label
            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.id = `option-${index}`;
            checkbox.checked = option.enabled;
            checkbox.addEventListener('change', (e) => this.handleOptionChange(index, (e.target as HTMLInputElement).checked));

            const label = document.createElement('label');
            label.htmlFor = `option-${index}`;
            label.textContent = option.name;

            const headerDiv = document.createElement('div');
            headerDiv.className = 'option-header';
            headerDiv.appendChild(checkbox);
            headerDiv.appendChild(label);

            // Create parameters container
            const paramsDiv = document.createElement('div');
            paramsDiv.className = 'option-parameters';

            if (option.isScript && option.presets.length > 0) {
                const presetsDiv = document.createElement('div');
                presetsDiv.className = 'option-presets option-parameter';

                const label = document.createElement('label');
                label.textContent = 'Presets';

                const input = document.createElement('select') as HTMLSelectElement;
                const optionElement = document.createElement('option');
                optionElement.value = "none";
                optionElement.textContent = "None";
                input.appendChild(optionElement);

                option.presets.forEach((preset) => {
                    const optionElement = document.createElement('option');
                    optionElement.value = preset;
                    optionElement.textContent = preset;
                    input.appendChild(optionElement);
                });

                input.disabled = !option.enabled;
                input.addEventListener('change', (e) => this.handlePresetChange(index, e.target as HTMLSelectElement));

                presetsDiv.appendChild(label);
                presetsDiv.appendChild(input);

                paramsDiv.appendChild(presetsDiv);
            }

            option.parameters.forEach((param, paramIndex) => {
                const paramDiv = document.createElement('div');
                paramDiv.className = 'option-parameter';

                const paramLabel = document.createElement('label');
                paramLabel.textContent = param.name;

                let input: HTMLInputElement | HTMLSelectElement;
                switch (param.value.type) {
                    case 'Boolean':
                        input = document.createElement('input') as HTMLInputElement;
                        input.type = 'checkbox';
                        input.checked = param.value.value;
                        break;
                    case 'Number':
                        input = document.createElement('input') as HTMLInputElement;
                        input.type = 'number';
                        input.value = param.value.value.toString();
                        break;
                    case 'Text':
                        input = document.createElement('input') as HTMLInputElement;
                        input.type = 'text';
                        input.value = param.value.value;
                        break;
                    case 'Select':
                        input = document.createElement('select') as HTMLSelectElement;

                        param.value.value[1].forEach((option) => {
                            const optionElement = document.createElement('option');
                            optionElement.value = option;
                            optionElement.textContent = option;
                            input.appendChild(optionElement);
                        });
                        input.value = param.value.value[0];
                        break;
                }

                input.disabled = !option.enabled;
                input.addEventListener('change', (e) => this.handleParameterChange(index, paramIndex, e.target as HTMLInputElement));

                paramDiv.appendChild(paramLabel);
                paramDiv.appendChild(input);
                paramsDiv.appendChild(paramDiv);
            });

            optionDiv.appendChild(headerDiv);
            optionDiv.appendChild(paramsDiv);
            this.content.appendChild(optionDiv);
        });
    }

    private handleOptionChange(index: number, enabled: boolean) {
        this.options[index].enabled = enabled;

        const checkbox = this.content.querySelector(`#option-${index}`) as HTMLInputElement;
        const optionElement = checkbox.parentElement?.parentElement as HTMLDivElement;
        const paramsDiv = optionElement.querySelector('.option-parameters') as HTMLDivElement | null;
        const presetsDiv = optionElement.querySelector('.option-presets') as HTMLDivElement | null;
        const presetsInput = presetsDiv?.querySelector('select') as HTMLSelectElement | null;

        if (paramsDiv) {
            const enableElements = enabled && ((presetsInput && presetsInput?.value === "none") || !presetsInput);
            for (const child of paramsDiv.children) {
                if (child.classList.contains('option-presets')) {
                    const select = child.querySelector('select') as HTMLSelectElement;
                    select.disabled = !enabled;
                } else {
                    const input = child.querySelector('input') as HTMLInputElement | null;
                    if (input) {
                        input.disabled = !enableElements;
                    }

                    const select = child.querySelector('select') as HTMLSelectElement | null;
                    if (select) {
                        select.disabled = !enableElements;
                    }
                }
            }
        }

        const game_key = main.settingsManager.appSettings.last_selected_game;
        const key = `${game_key}:${this.options[index].key}`;
        main.settingsManager.appSettings.launch_options[key] = enabled.toString();
        main.settingsManager.saveSettings();
    }

    private handleParameterChange(optionIndex: number, paramIndex: number, input: HTMLInputElement | HTMLSelectElement) {
        const option = this.options[optionIndex];
        const param = option.parameters[paramIndex];

        switch (param.value.type) {
            case 'Boolean':
                param.value.value = (input as HTMLInputElement).checked;
                break;
            case 'Number':
                param.value.value = parseFloat((input as HTMLInputElement).value);
                break;
            case 'Text':
                param.value.value = (input as HTMLInputElement).value;
                break;
            case 'Select':
                param.value.value[0] = (input as HTMLSelectElement).value;
                break;
        }

        const game_key = main.settingsManager.appSettings.last_selected_game;
        const key = `${game_key}:${option.key}:${param.key}`;
        main.settingsManager.appSettings.launch_options[key] = param.value.value.toString();
        main.settingsManager.saveSettings();
    }

    private handlePresetChange(index: number, input: HTMLSelectElement) {
        const option = this.options[index];

        const checkbox = this.content.querySelector(`#option-${index}`) as HTMLInputElement;
        const optionElement = checkbox.parentElement?.parentElement as HTMLDivElement;
        const paramsDiv = optionElement.querySelector('.option-parameters') as HTMLDivElement | null;

        if (paramsDiv) {

            // None means no preset.
            const enableElements = input.value === "none";
            for (const child of paramsDiv.children) {
                if (child.classList.contains('option-presets')) {
                    continue;
                }

                const input = child.querySelector('input') as HTMLInputElement | null;
                if (input) {
                    input.disabled = !enableElements;
                }

                const select = child.querySelector('select') as HTMLSelectElement | null;
                if (select) {
                    select.disabled = !enableElements;
                }
            }
        }

        const game_key = main.settingsManager.appSettings.last_selected_game;
        const key = `${game_key}:${option.key}:preset`;
        main.settingsManager.appSettings.launch_options[key] = input.value;
        main.settingsManager.saveSettings();
    }

    public openPanel() {
        this.slidingPanel.classList.remove('hidden');
        setTimeout(() => {
            this.slidingPanel.classList.add('open');
        }, 30);
    }

    public closePanel() {
        this.slidingPanel.classList.remove('open');
        setTimeout(() => {
            this.slidingPanel.classList.add('hidden');
        }, 300);
    }

    public getOptions() {
        return this.options;
    }
}