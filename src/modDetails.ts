import { invoke } from "@tauri-apps/api/core";
import { Main } from "./main";
import { steamFormatToHtml } from "./utils/steamFormat";

export class ModDetailsPanel {
  private slidingPanel: HTMLElement;
  private arrow: HTMLElement;
  private content: HTMLElement;
  private openModFolderBtn: HTMLButtonElement;
  private openModPageBtn: HTMLButtonElement;
  private currentItemId: string;
  
  constructor() {
    this.currentItemId = '';

    this.slidingPanel = document.createElement('div');
    this.slidingPanel.className = 'sliding-panel hidden';

    this.arrow = document.createElement('div');
    this.arrow.className = 'arrow-pointer';
    this.slidingPanel.appendChild(this.arrow);

    const header = document.createElement('div');
    header.className = 'sliding-panel-header';

    const title = document.createElement('h2');
    title.textContent = 'Mod Details';

    const panelActions = document.createElement('div');
    panelActions.className = 'panel-actions';

    this.openModFolderBtn = document.createElement('button');
    this.openModFolderBtn.className = 'panel-btn';
    this.openModFolderBtn.title = 'Open Mod Folder';
    this.openModFolderBtn.innerHTML = '<i class="fa-solid fa-folder-open"></i>';
    this.openModFolderBtn.addEventListener('click', () => this.openModFolder());

    this.openModPageBtn = document.createElement('button');
    this.openModPageBtn.className = 'panel-btn';
    this.openModPageBtn.title = 'Open Mod Page in Browser';
    this.openModPageBtn.innerHTML = '<i class="fa-solid fa-external-link-alt"></i>';
    this.openModPageBtn.addEventListener('click', () => this.openModUrl());

    const closeButton = document.createElement('button');
    closeButton.className = 'sliding-panel-close';
    closeButton.innerHTML = '<i class="fa-solid fa-times"></i>';
    closeButton.addEventListener('click', () => this.closeSlidingPanel());

    panelActions.appendChild(this.openModFolderBtn);
    panelActions.appendChild(this.openModPageBtn);
    header.appendChild(title);
    header.appendChild(panelActions);
    header.appendChild(closeButton);

    // Crear el contenido del panel
    this.content = document.createElement('div');
    this.content.className = 'sliding-panel-content';
    this.content.id = 'sliding-panel-content';

    this.slidingPanel.appendChild(header);
    this.slidingPanel.appendChild(this.content);

    document.body.appendChild(this.slidingPanel);
  }
 
  /**
   * Toggle the mod details panel, and populate it with the mod details, if we have any.
   * @param {Main} main - The main instance.
   * @param {string} itemId - The id of the mod to show details for.
   */
  public toggleModDetails(main: Main, itemId: string) {  
    const itemElement = main.modTree.getItemElementById(itemId);
    if (!itemElement) {
      this.closeSlidingPanel();
      return;
    }

    const modDetails = main.modTree.getModDetailsElementById(itemId);
    if (!modDetails) {
      this.closeSlidingPanel();
      return;
    }

    console.log(this.currentItemId, itemId);
    const isSameItem = this.currentItemId === itemId;
    if (this.slidingPanel.classList.contains('open') && isSameItem) {
      this.currentItemId = ''
      this.closeSlidingPanel();
      return;
    }

    // Update the arrow position, and set it to update again when scrolling the mod tree.
    this.updateArrowPosition(itemElement);
    main.modTree.getTreeParentElement().addEventListener("scroll", () => {
      this.updateArrowPosition(itemElement);
    });

    // Update the panel content with the mod details.
    // FIXME: This needs proper html formatting/parsing.
    this.content.innerHTML = `
      <div class="mod-detail-section">
        <h3>General Information</h3>
        <div class="mod-detail-item">
          <strong>Name:</strong>
          <span>${modDetails.name}</span>
        </div>
        <div class="mod-detail-item">
          <strong>Type:</strong>
          <span>${modDetails.type || 'N/A'}</span>
        </div>
        <div class="mod-detail-item">
          <strong>Creator:</strong>
          <span>${modDetails.creator || 'N/A'}</span>
        </div>
        <div class="mod-detail-item">
          <strong>Size:</strong>
          <span>${modDetails.size || 'N/A'}</span>
        </div>
        <div class="mod-detail-item">
          <strong>Location:</strong>
          <span>${modDetails.location || 'N/A'}</span>
        </div>
      </div>
      ${modDetails.description ? `
        <div class="mod-detail-section">
          <h3>Description</h3>
          <div class="mod-description">
            ${steamFormatToHtml(modDetails.description)}
          </div>
        </div>
      ` : ''}
    `;

    this.currentItemId = itemId;
    if (!this.slidingPanel.classList.contains('open') && !isSameItem) {
      this.openSlidingPanel();
    }
  }

  /**
   * Open the mod folder in the file explorer.
   */
  private async openModFolder() {
    try {
      await invoke("open_mod_folder", { 
        id: this.currentItemId 
      });
    } catch (error) {
      console.error("Failed to open mod folder:", error);
    }
  }

  /**
   * Open the mod url in the browser.
   */
  private async openModUrl() {
    try {
      await invoke("open_mod_url", { 
        id: this.currentItemId 
      });
    } catch (error) {
      console.error("Failed to open mod url:", error);
    }
  }

  /**
   * Open the sliding panel.
   */ 
  public openSlidingPanel() {
    this.slidingPanel.classList.remove('hidden');
    setTimeout(() => {
      this.slidingPanel.classList.add('open');
    }, 30);
  }

  /**
   * Close the sliding panel.
   */
  public closeSlidingPanel() {
    this.slidingPanel.classList.remove('open');
    setTimeout(() => {
      this.slidingPanel.classList.add('hidden');
    }, 300);
  }

  /**
   * Clear the content of the sliding panel.
   */
  public clearContent() {
    this.closeSlidingPanel();
    this.content.innerHTML = '';
  }

  /**
   * Update the arrow position to keep pointing to the correct mod item.
   * @param {HTMLElement} itemElement - The item element.
   */
  private updateArrowPosition(itemElement: HTMLElement) {
    const itemRect = itemElement.getBoundingClientRect();
    const arrowTop = itemRect.top + (itemRect.height / 2) - 10;
    this.arrow.style.top = `${arrowTop}px`;
  }
}