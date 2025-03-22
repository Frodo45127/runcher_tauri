/**
 * This file contains the settings manager for the app.
 */

import { invoke } from "@tauri-apps/api/core";
import { Main } from "./main";

interface AppSettings {
  tree_open_state: { [key: string]: boolean };
  tree_filter_value: string;
  list_filter_value: string;
  selected_tree_item: string | null;
  selected_list_item: string | null;
  panel_heights: { [key: string]: number };
  right_panel_width: number;
  paths: { [key: string]: string };
  strings: { [key: string]: string };
  default_game: string;
  language: string;
  date_format: string;
  check_updates_on_start: boolean;
  check_schema_updates_on_start: boolean;
  check_sql_scripts_updates_on_start: boolean;
}

export class SettingsManager {
  private isLoaded: boolean;
  private appSettings: AppSettings;

  constructor(main: Main) {
    this.appSettings = {
      tree_open_state: {},
      tree_filter_value: '',
      list_filter_value: '',
      selected_tree_item: null,
      selected_list_item: null,
      panel_heights: {},
      right_panel_width: 300,
      paths: {},
      strings: {},
      default_game: 'warhammer_2',
      language: 'English',
      date_format: 'DD/MM/YYYY',
      check_updates_on_start: true,
      check_schema_updates_on_start: true,
      check_sql_scripts_updates_on_start: true
    };

    this.loadSettings(main);
  }

  /**
   * Load app settings.
   */
  public async loadSettings(main: Main) {
    try {
      const settings = await invoke('init_settings') as Partial<AppSettings>;
      this.appSettings = {
        ...this.appSettings,
        ...(settings as AppSettings)
      };

      this.isLoaded = true;

      await this.applySettings(main).then(main.sidebar.clickSidebarButton(this.appSettings.default_game));
    } catch (error) {
      console.error('Failed to load settings:', error);
    }
  }
  
  // Load app settings
  public async applySettings(main: Main) {
    try {
      if (this.isLoaded) { 
        await main.sidebar.updateSidebarIcons(this.appSettings);
        
        const treeFilter = document.getElementById('tree-filter') as HTMLInputElement;
        if (treeFilter && this.appSettings.tree_filter_value) {
          treeFilter.value = this.appSettings.tree_filter_value;
          main.modTree.filterTreeItems(this, this.appSettings.tree_filter_value);
        }
        
        const listFilter = document.getElementById('list-filter') as HTMLInputElement;
        if (listFilter && this.appSettings.list_filter_value) {
          listFilter.value = this.appSettings.list_filter_value;
          main.packList.filterListItems(this, this.appSettings.list_filter_value);
        }
        
        // Set panel width from settings
        document.documentElement.style.setProperty('--right-panel-width', `${this.appSettings.right_panel_width}px`);
      } else {
        console.log('Settings not loaded');
      }
    } catch (error) {
      console.error('Failed to load settings:', error);
    }
  }

  // Save app settings
  public async saveSettings() {
    try {
      await invoke('save_settings', { 
        settings: {
          tree_open_state: this.appSettings.tree_open_state,
          tree_filter_value: this.appSettings.tree_filter_value,
          list_filter_value: this.appSettings.list_filter_value,
          selected_tree_item: this.appSettings.selected_tree_item,
          selected_list_item: this.appSettings.selected_list_item,
          panel_heights: this.appSettings.panel_heights,
          right_panel_width: this.appSettings.right_panel_width,
          paths: this.appSettings.paths,
          strings: this.appSettings.strings,
          default_game: this.appSettings.default_game,
          language: this.appSettings.language,
          date_format: this.appSettings.date_format,
          check_updates_on_start: this.appSettings.check_updates_on_start,
          check_schema_updates_on_start: this.appSettings.check_schema_updates_on_start,
          check_sql_scripts_updates_on_start: this.appSettings.check_sql_scripts_updates_on_start
        }
      });
    } catch (error) {
      console.error('Failed to save settings:', error);
    }
  }
}
