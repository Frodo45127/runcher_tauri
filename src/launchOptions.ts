import { invoke } from "@tauri-apps/api/core";

interface LaunchOption {
    name: string;
    enabled: boolean;
    parameters: LaunchOptionParameter[];
}

interface LaunchOptionParameter {
    name: string;
    value: LaunchOptionValue;
}

type LaunchOptionValue =
    | { type: "Boolean"; value: boolean }
    | { type: "Number"; value: number }
    | { type: "Text"; value: string }
    | { type: "Select"; value: string[] };

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
                        param.value.value.forEach((option) => {
                            const optionElement = document.createElement('option');
                            optionElement.value = option;
                            optionElement.textContent = option;
                            input.appendChild(optionElement);
                        });
                        console.log(param);
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
        this.renderOptions();
    }

    private handleParameterChange(optionIndex: number, paramIndex: number, input: HTMLInputElement) {
        const option = this.options[optionIndex];
        const param = option.parameters[paramIndex];

        switch (param.value.type) {
            case 'Boolean':
                param.value.value = input.checked;
                break;
            case 'Number':
                param.value.value = parseFloat(input.value);
                break;
            case 'Text':
                param.value.value = input.value;
                break;
            case 'Select':
                param.value.value = [input.value];
                break;
        }
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
}