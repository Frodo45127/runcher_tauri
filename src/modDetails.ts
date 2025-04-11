import { invoke } from "@tauri-apps/api/core";
import { Main } from "./main";
import { steamFormatToHtml } from "./utils/steamFormat";

export class ModDetailsPanel {
  private currentItemId: string;
  private currentItemElement: HTMLElement | null;

  private slidingPanel: HTMLElement;
  private arrow: HTMLElement;

  private detailName: HTMLSpanElement;
  private detailType: HTMLSpanElement;
  private detailCreator: HTMLSpanElement;
  private detailSize: HTMLSpanElement;
  private detailLocation: HTMLSpanElement;
  private detailDescriptionSection: HTMLDivElement;
  private detailDescription: HTMLDivElement;

  private openModFolderBtn: HTMLButtonElement;
  private openModPageBtn: HTMLButtonElement;
  private closeBtn: HTMLButtonElement;

  constructor(main: Main) {
    this.currentItemId = '';
    this.currentItemElement = null;

    this.slidingPanel = document.getElementById('sliding-panel-content') as HTMLElement;
    this.arrow = document.getElementById('sliding-panel-arrow') as HTMLElement;

    this.detailName = document.getElementById('mod-detail-name') as HTMLSpanElement;
    this.detailType = document.getElementById('mod-detail-type') as HTMLSpanElement;
    this.detailCreator = document.getElementById('mod-detail-creator') as HTMLSpanElement;
    this.detailSize = document.getElementById('mod-detail-size') as HTMLSpanElement;
    this.detailLocation = document.getElementById('mod-detail-location') as HTMLSpanElement;
    this.detailDescriptionSection = document.getElementById('mod-detail-description-section') as HTMLDivElement;
    this.detailDescription = document.getElementById('mod-detail-description') as HTMLDivElement;

    this.openModFolderBtn = document.getElementById('open-mod-folder-btn') as HTMLButtonElement;
    this.openModPageBtn = document.getElementById('open-mod-page-btn') as HTMLButtonElement;
    this.closeBtn = document.getElementById('sliding-panel-close-btn') as HTMLButtonElement;

    this.openModFolderBtn.addEventListener('click', () => this.openModFolder());
    this.openModPageBtn.addEventListener('click', () => this.openModUrl());
    this.closeBtn.addEventListener('click', () => this.closeSlidingPanel());

    main.modTree.getTreeParentElement().addEventListener("scroll", () => {
      this.updateArrowPosition();
    });
  }

  /**
   * Toggle the mod details panel, and populate it with the mod details, if we have any.
   * @param {string} itemId - The id of the mod to show details for.
   */
  public toggleModDetails(itemId: string) {
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

    const isSameItem = this.currentItemId === itemId;
    if (this.slidingPanel.classList.contains('open') && isSameItem) {
      this.currentItemId = ''
      this.closeSlidingPanel();
      return;
    }

    this.currentItemElement = itemElement;
    this.currentItemId = itemId;

    this.updateArrowPosition();

    this.detailName.textContent = modDetails.name;
    this.detailType.textContent = modDetails.type || 'N/A';
    this.detailCreator.textContent = modDetails.creator || 'N/A';
    this.detailSize.textContent = modDetails.size || 'N/A';
    this.detailLocation.textContent = modDetails.location || 'N/A';

    if (modDetails.description) {
      this.detailDescriptionSection.classList.remove('hidden');
      this.detailDescription.innerHTML = steamFormatToHtml(modDetails.description);
    } else {
      this.detailDescriptionSection.classList.add('hidden');
      this.detailDescription.innerHTML = '';
    }

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
    this.currentItemId = '';
    this.currentItemElement = null;

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
  }

  /**
   * Update the arrow position to keep pointing to the correct mod item.
   */
  private updateArrowPosition() {
    if (this.currentItemElement) {
      const itemRect = this.currentItemElement.getBoundingClientRect();
      const arrowTop = itemRect.top + (itemRect.height / 2) - 10;
      this.arrow.style.top = `${arrowTop}px`;
    }
  }
}