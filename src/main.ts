import { invoke } from "@tauri-apps/api/core";
import { SettingsManager } from "./settings";
import { Sidebar } from "./sidebar";
import { ModTree, TreeCategory } from "./modTree";
import { PackList, ListItem } from "./packList";
import { SettingsModal } from "./settingsModal";
import { ModDetailsPanel } from "./modDetails";
import { LoadingManager } from "./loadingManager";
import { StatusBar } from "./statusBar";
import { LaunchOptionsPanel } from "./launchOptions";

// Store the main instance, which should contain everything in the app.
declare global {

  /* eslint no-var: "off" */
  var main: Main;
}

export class Main {
  public settingsManager: SettingsManager;
  public sidebar: Sidebar;
  public modTree: ModTree;
  public packList: PackList;
  public settingsModal: SettingsModal;
  public modDetails: ModDetailsPanel;
  public loadingManager: LoadingManager;
  private statusBar: StatusBar;
  public launchOptions: LaunchOptionsPanel;

  private launchBtn: HTMLButtonElement;
  private settingsBtn: HTMLButtonElement;

  constructor() {
    this.loadingManager = new LoadingManager();
    this.loadingManager.showAppLoading();

    this.sidebar = new Sidebar(this);
    this.modTree = new ModTree(this);
    this.packList = new PackList(this);
    this.settingsModal = new SettingsModal();
    this.modDetails = new ModDetailsPanel(this);
    this.statusBar = new StatusBar();
    this.launchOptions = new LaunchOptionsPanel();

    // Add event listener for launch button
    this.launchBtn = document.getElementById("launch-game-btn") as HTMLButtonElement;
    this.launchBtn.addEventListener("click", () => this.launchGame());

    // Setup settings modal
    this.settingsBtn = document.getElementById('settings-btn') as HTMLButtonElement;
    this.settingsBtn.addEventListener('click', () => this.settingsModal.openSettingsModal(this));

    // Once everything is loaded, load the settings.
    this.settingsManager = new SettingsManager();
    this.settingsManager.loadSettings().then(() => {
      this.initializeResizablePanels();
      this.sidebar.updateSidebarIcons(this.settingsManager).then(() => {
        this.loadingManager.hideAppLoading();

        // Once here, there are two paths:
        // - The user has already configured at least one game path (last selected game).
        // - The user has not configured any game paths, or the last selected game is not configured.
        //
        // In the first case, we can just select the last selected game in the sidebar and that will take care of initializing everything.
        // In the second case, we need to show the settings modal with an error message, and only allow to either close the app, or
        // provide a valid game path.
        if (this.sidebar.isDefaultGameConfigured(this.settingsManager.appSettings.last_selected_game)) {
          this.sidebar.clickSidebarButton(this.settingsManager.appSettings.last_selected_game);
        } else {
          this.settingsModal.openWithNoGameDetected(this);
        }
      });
    });
  }

  // Initialize resizable panels
  private initializeResizablePanels() {
    const rightPanel = document.querySelector('.right-panel') as HTMLElement;
    const resizeHandle = document.querySelector('.horizontal-resize-handle') as HTMLElement;
    let isResizing = false;
    let startX: number;
    let startWidth: number;

    const startResize = (e: MouseEvent) => {
      e.preventDefault();
      isResizing = true;
      startX = e.clientX;
      startWidth = rightPanel.offsetWidth;
      document.body.style.cursor = 'col-resize';
    };

    const stopResize = (e: MouseEvent) => {
      e.preventDefault();
      isResizing = false;
      document.body.style.cursor = 'default';
    };

    const resize = (e: MouseEvent) => {
      e.preventDefault();
      if (!isResizing) return;

      const width = startWidth - (e.clientX - startX);
      const minWidth = 200;
      const maxWidth = window.innerWidth * 0.5;

      if (width >= minWidth && width <= maxWidth) {
        rightPanel.style.width = `${width}px`;
        document.documentElement.style.setProperty('--right-panel-width', `${width}px`);
      }
    };

    resizeHandle.addEventListener('mousedown', startResize);
    document.addEventListener('mousemove', resize);
    document.addEventListener('mouseup', stopResize);
  }

  // Launch game function
  public async launchGame() {
    try {

      const button = document.querySelector('.sidebar-btn.active') as HTMLElement;
      if (button) {
        const id = button.dataset.id || '';
        const result = await invoke("launch_game", {
          id: id,
          launchOptions: this.launchOptions.getOptions()
        });

        this.showStatusMessage(result as string);
      }
      else {
        this.showStatusMessage("No game selected");
      }
    } catch (error) {
      console.error("Failed to launch game:", error);
      this.showStatusMessage(`Error: ${error}`);
    }
  }

  /************************
   * Handles
   ************************/

  /**
   * Handles the game selected change.
   * @param {string} gameId - The id of the game.
   */
  public async handleGameSelectedChange(gameId: string) {
    // Update the last selected game
    this.settingsManager.appSettings.last_selected_game = gameId;

    // Show the loading indicators.
    this.loadingManager.showTreeLoading(this);
    this.loadingManager.showListLoading(this);
    this.loadingManager.showProgress();

    try {
      const [treeData, listData] = await invoke("handle_change_game_selected", { gameId }) as [TreeCategory[], ListItem[]];

      this.modTree.categories = treeData;
      this.modTree.renderTree(this);
      this.loadingManager.hideTreeLoading(this);

      await this.packList.renderPackList(this, listData);
      this.loadingManager.hideListLoading(this);
      this.modDetails.clearContent();

      // Expand the categories saved in the settings.
      Object.keys(this.settingsManager.appSettings.tree_open_state).forEach(categoryId => {
        if (this.settingsManager.appSettings.tree_open_state[categoryId]) {
          this.modTree.toggleCategoryExpansion(this.settingsManager, categoryId, true);
        }
      });

      // Restore the selected item if it exists.
      if (this.settingsManager.appSettings.selected_tree_item) {
        this.modTree.selectTreeItem(this, this.settingsManager.appSettings.selected_tree_item);
      }

      // Load the launch options.
      this.launchOptions.loadOptions();

      // Save settings after change
      await this.settingsManager.saveSettings();
    } catch (error) {
      console.error("Failed to handle checkbox change:", error);
    }
    finally {
      this.loadingManager.hideTreeLoading(this);
      this.loadingManager.hideListLoading(this);
      this.loadingManager.hideProgress();
    }
  }

  /************************
   * Utils
   ************************/

  /**
   * Shows a status message in the status bar.
   * @param {string} message - The message to show in the status bar.
   */
  public showStatusMessage(message: string) {
    this.statusBar.showStatusMessage(message);
  }
}

// Initialize the main instance once the DOM is loaded.
window.addEventListener("DOMContentLoaded", async () => {
  window.name = "main";
  globalThis.main = new Main();
});
