import { invoke } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import { SettingsManager } from "./settings";
import { Sidebar } from "./sidebar";
import { ModTree, TreeCategory } from "./modTree";
import { PackList, ListItem } from "./packList";
import { SettingsModal } from "./settingsModal";
import { ModDetailsPanel } from "./modDetails";
import { LoadingManager } from "./loadingManager";

// Store the main instance, which should contain everything in the app.
declare global {

  /* eslint no-var: "off" */
  var main: Main;
}

const GITHUB_URL = "https://github.com/Frodo45127/runcher";
const DISCORD_URL = "https://discord.gg/moddingden";
const PATREON_URL = "https://www.patreon.com/RPFM";

export class Main {
  public settingsManager: SettingsManager;
  public sidebar: Sidebar;
  public modTree: ModTree;
  public packList: PackList;
  public settingsModal: SettingsModal;
  public modDetails: ModDetailsPanel;
  public statusMessage: HTMLElement;
  public loadingManager: LoadingManager;

  private launchBtn: HTMLButtonElement;
  private settingsBtn: HTMLButtonElement;
  private patreonBtn: HTMLButtonElement;
  private discordBtn: HTMLButtonElement;
  private githubBtn: HTMLButtonElement;
  private updaterBtn: HTMLButtonElement;

  constructor() {
    this.loadingManager = new LoadingManager();
    this.loadingManager.showAppLoading();

    this.sidebar = new Sidebar(this);
    this.modTree = new ModTree(this);
    this.packList = new PackList(this);
    this.settingsModal = new SettingsModal();
    this.modDetails = new ModDetailsPanel();
    this.statusMessage = document.querySelector('.status-message') as HTMLElement;

    this.patreonBtn = document.getElementById('patreon-btn') as HTMLButtonElement;
    this.patreonBtn.addEventListener('click', () => this.openPatreon());

    this.discordBtn = document.getElementById('discord-btn') as HTMLButtonElement;
    this.discordBtn.addEventListener('click', () => this.openDiscord());

    this.githubBtn = document.getElementById('github-btn') as HTMLButtonElement;
    this.githubBtn.addEventListener('click', () => this.openGithub());

    this.updaterBtn = document.getElementById('updater-btn') as HTMLButtonElement;
    this.updaterBtn.addEventListener('click', () => this.openUpdater());

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
          id: id
        });

        main.statusMessage.textContent = result as string;
      }
      else {
        main.statusMessage.textContent = "No game selected";
      }
    } catch (error) {
      console.error("Failed to launch game:", error);
      main.statusMessage.textContent = `Error: ${error}`;
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
   * Status Bar buttons
   ************************/

  public openPatreon() {
    openUrl(PATREON_URL);
  }

  public openDiscord() {
    openUrl(DISCORD_URL);
  }

  public openGithub() {
    openUrl(GITHUB_URL);
  }

  private openUpdater() {
    console.log('Updater');
  }
}

// Initialize the main instance once the DOM is loaded.
window.addEventListener("DOMContentLoaded", async () => {
  window.name = "main";
  try {
    // Notify Rust that the window is ready
    const response = await invoke('on_window_ready');
    console.log('Window ready notification sent to Rust:', response);
  } catch (error) {
    console.error('Error during window ready notification:', error);
  }

  globalThis.main = new Main();
});
