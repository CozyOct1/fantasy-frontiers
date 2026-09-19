export type AppScreen = "hub" | "gameplay" | "result";

/** Minimal navigation state for the game's Hub, battle, and result screens. */
export class ScreenFlow {
  private activeScreen: AppScreen;

  constructor(
    private readonly onChange: (screen: AppScreen) => void,
    initialScreen: AppScreen = "hub",
  ) {
    this.activeScreen = initialScreen;
    this.onChange(initialScreen);
  }

  get current(): AppScreen {
    return this.activeScreen;
  }

  show(screen: AppScreen): void {
    if (screen === this.activeScreen) return;
    this.activeScreen = screen;
    this.onChange(screen);
  }
}
