import { invoke } from "@tauri-apps/api/core";
import { Main } from "./main";
import { SettingsManager } from "./settings";

interface SidebarIcon {
  id: string;
  name: string;
  icon: string;
}

export class Sidebar {
  private icons: SidebarIcon[];
  private buttons: Map<string, HTMLElement>;
  private container: HTMLElement;

  /**
   * Constructor for the sidebar.
   * @param {Main} main - The main instance of the application.
   */
  constructor(main: Main) {
    this.buttons = new Map();
    this.container = document.getElementById("sidebar-buttons");

    this.loadSidebarIcons(main).then(() => {
      console.log("Sidebar icons loaded");
    });
  }

  /**
   * Load sidebar icons from Rust
   * @param {Main} main - The main instance of the application.
   */
  public async loadSidebarIcons(main: Main) {
    try {
      this.icons = [];
      this.icons = await invoke("get_sidebar_icons");

      this.buttons = new Map();

      this.icons.forEach(icon => {
        const button = document.createElement("button");
        button.className = "sidebar-btn";
        button.dataset.id = icon.id;
        
        // Create an image element instead of using FontAwesome
        const img = document.createElement("img");
        img.src = `icons/${icon.icon}`;
        img.alt = icon.name;
        img.className = "sidebar-icon";
        
        button.appendChild(img);
        button.title = icon.name;
        
        button.addEventListener("click", (e) => {
          // Remove active class from all buttons
          document.querySelectorAll(".sidebar-btn").forEach(btn => 
            btn.classList.remove("active")
          );
          
          // Add active class to clicked button
          button.classList.add("active");

          console.log("Game selected changed");
          const isChecked = (e.target as HTMLInputElement).checked;
          const buttonId = button.dataset.id ? button.dataset.id : '';
          main.handleGameSelectedChange(buttonId, isChecked);
          e.stopPropagation(); // Prevent the row selection from triggering
        });
        
        this.container.appendChild(button);
        this.buttons.set(button.dataset.id, button);
      });
    } catch (error) {
      console.error("Failed to load sidebar icons:", error);
    }
  }

  public async updateSidebarIcons(settingsManager: SettingsManager) {
    this.icons.forEach(icon => {
      const button = this.buttons.get(icon.id);
      
      if (settingsManager.appSettings.paths[icon.id] === undefined || settingsManager.appSettings.paths[icon.id] === "") {
        button.classList.add("hidden");
      } else {
        button.classList.remove("hidden");
      }
    });
  }

  public async clickSidebarButton(id: string) {
    this.buttons.get(id).click();
  }

  /**
   * Get the selected button in the sidebar.
   * @returns {string} The id of the selected button.
   */
  public getSidebarSelectedButton(): string {
    const selectedButton = document.querySelector('.sidebar-btn.active') as HTMLElement;
    return selectedButton ? selectedButton.dataset.id || '' : '';
  }
}
