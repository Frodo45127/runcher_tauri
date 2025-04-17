import { invoke } from "@tauri-apps/api/core";
import { Main } from "./main";
import { SettingsManager } from "./settings";

export interface SidebarIcon {
  id: string;
  name: string;
  icon: string;
}

export class Sidebar {
  private icons: SidebarIcon[];
  private buttons: Map<string, HTMLButtonElement>;
  private container: HTMLElement;

  /**
   * Constructor for the sidebar.
   * @param {Main} main - The main instance of the application.
   */
  constructor(main: Main) {
    this.icons = [];
    this.buttons = new Map();
    this.container = document.getElementById("sidebar-buttons") as HTMLElement;

    this.loadSidebarIcons(main).then(() => {
      //console.log("Sidebar icons loaded");
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
          const buttonId = button.dataset.id ? button.dataset.id : '';
          main.handleGameSelectedChange(buttonId);
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
      const button = this.buttons.get(icon.id) as HTMLButtonElement;
      const path = settingsManager.appSettings.paths[icon.id];

      if (path === undefined || path === "") {
        button.classList.add("hidden");
      } else {
        button.classList.remove("hidden");
      }
    });
  }

  public async clickSidebarButton(id: string) {
    (this.buttons.get(id) as HTMLButtonElement).click();
  }

  public isAnyGameConfigured(): boolean {
    return Array.from(this.buttons.values()).some(button => !button.classList.contains("hidden"));
  }

  public isDefaultGameConfigured(defaultGame: string): boolean {
    const button = this.buttons.get(defaultGame);
    return button !== undefined && !button.classList.contains("hidden");
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
