import { invoke } from '@tauri-apps/api/core';
import { steamFormatToHtml } from './utils/steamFormat';

interface RemoteMetadata {
  remote_id: string;
  title: string;
  description: string;
  visibility: Visibility;
  tags: string[];
}

enum Visibility {
  Public = 'Public',
  FriendsOnly = 'Friends Only',
  Private = 'Private',
  Unlisted = 'Unlisted',
}

export class UploadModModal {
  private modal: HTMLElement;
  private previewImage: HTMLImageElement;
  private previewInput: HTMLInputElement;
  private previewButton: HTMLButtonElement;
  private titleInput: HTMLInputElement;
  private descriptionInput: HTMLTextAreaElement;
  private changelogInput: HTMLTextAreaElement;
  private visibilitySelect: HTMLSelectElement;
  private tagsSelect: HTMLSelectElement;
  private cancelButton: HTMLButtonElement;
  private submitButton: HTMLButtonElement;
  private errorElement: HTMLElement;
  private descriptionPreview: HTMLElement;
  private changelogPreview: HTMLElement;
  private modId: string;

  constructor() {
    this.modal = document.getElementById('upload-mod-modal') as HTMLElement;
    this.previewImage = document.getElementById('upload-mod-preview') as HTMLImageElement;
    this.previewInput = document.getElementById('upload-mod-preview-input') as HTMLInputElement;
    this.previewButton = document.getElementById('upload-mod-preview-btn') as HTMLButtonElement;
    this.titleInput = document.getElementById('upload-mod-title') as HTMLInputElement;
    this.descriptionInput = document.getElementById('upload-mod-description') as HTMLTextAreaElement;
    this.changelogInput = document.getElementById('upload-mod-changelog') as HTMLTextAreaElement;
    this.visibilitySelect = document.getElementById('upload-mod-visibility') as HTMLSelectElement;
    this.tagsSelect = document.getElementById('upload-mod-tags') as HTMLSelectElement;
    this.cancelButton = document.getElementById('upload-mod-cancel-btn') as HTMLButtonElement;
    this.submitButton = document.getElementById('upload-mod-submit-btn') as HTMLButtonElement;
    this.errorElement = document.getElementById('upload-mod-error') as HTMLElement;
    this.descriptionPreview = document.getElementById('upload-mod-description-preview') as HTMLElement;
    this.changelogPreview = document.getElementById('upload-mod-changelog-preview') as HTMLElement;
    this.modId = '';

    this.setupEventListeners();
  }

  private setupEventListeners() {
    this.previewButton.addEventListener('click', () => {
      this.previewInput.click();
    });

    this.previewInput.addEventListener('change', (event) => {
      const file = (event.target as HTMLInputElement).files?.[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = (e) => {
          this.previewImage.src = e.target?.result as string;
        };
        reader.readAsDataURL(file);
      }
    });

    this.descriptionInput.addEventListener('input', () => {
      setTimeout(() => {
        this.descriptionPreview.innerHTML = steamFormatToHtml(this.descriptionInput.value);
      }, 100);
    });

    this.changelogInput.addEventListener('input', () => {
      setTimeout(() => {
        this.changelogPreview.innerHTML = steamFormatToHtml(this.changelogInput.value);
      }, 100);
    });

    this.cancelButton.addEventListener('click', () => {
      this.closeModal();
    });

    this.submitButton.addEventListener('click', async () => {
      await this.handleSubmit();
    });
  }

  public openModal(modId: string) {
    main.loadingManager.showAppLoading();

    this.modId = modId;
    this.resetForm().then(() => {
      this.modal.classList.add('active');
    }).finally(() => {
      main.loadingManager.hideAppLoading();
    });
  }

  public closeModal() {
    this.modal.classList.remove('active');
  }

  private async resetForm() {
    this.previewImage.src = 'icons/gs_3k.png';
    this.previewInput.value = '';
    this.titleInput.value = '';
    this.descriptionInput.value = '';
    this.changelogInput.value = '';
    this.visibilitySelect.value = 'Private';
    this.tagsSelect.innerHTML = '';
    this.errorElement.textContent = '';

    try {

      // We need to get the most recent data from the integration in order to make sure we don't submit outdated description, tags, etc.
      const data = await invoke('request_mod_remote_metadata', {
        modId: this.modId
      }) as RemoteMetadata;

      this.titleInput.value = data.title;
      this.descriptionInput.value = data.description;
      this.changelogInput.value = 'Me forgot to write a changelog...';
      this.descriptionPreview.innerHTML = steamFormatToHtml(data.description);
      this.changelogPreview.innerHTML = steamFormatToHtml(this.changelogInput.value);
      this.visibilitySelect.value = data.visibility.toString();

      // Get the available tags for the game we have selected.
      const tags = await invoke('mod_tags_available', {}) as string[];
      this.tagsSelect.innerHTML = tags.map(tag => `<option value="${tag}">${tag}</option>`).join('');
      this.tagsSelect.value = data.tags[1] || this.tagsSelect.options[0].value;

      // TODO: Get the preview image and load it.

      console.log(data);
    } catch (error) {
      main.showStatusMessage(`Failed to get mod info: ${error}`);
    }
  }

  private async handleSubmit() {
    this.errorElement.textContent = '';

    const title = this.titleInput.value.trim();
    const description = this.descriptionInput.value.trim();
    const changelog = this.changelogInput.value.trim();
    const visibility = this.visibilitySelect.value;
    const tags = this.tagsSelect.value;
    //const previewFile = this.previewInput.files?.[0];

    if (!title) {
      this.errorElement.textContent = 'Title is required.';
      return;
    }

    if (!description) {
      this.errorElement.textContent = 'Description is required.';
      return;
    }

    if (!visibility) {
      this.errorElement.textContent = 'Visibility is required.';
      return;
    }

    if (!tags) {
      this.errorElement.textContent = 'Tags are required.';
      return;
    }

    try {
      /*await invoke('upload_mod', {
        title,
        description,
        changelog,
        visibility,
        //preview: previewFile ? await this.readFileAsBase64(previewFile) : null
      });*/

      this.closeModal();
    } catch (error) {
      this.errorElement.textContent = `Failed to upload mod: ${error}`;
    }
  }
/*
  private readFileAsBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const base64String = (reader.result as string).split(',')[1];
        resolve(base64String);
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }*/
}