import React from "react";
import { render, screen, fireEvent, act } from "@testing-library/react";
import "@testing-library/jest-dom";
import "@/i18n";
import InstallPrompt from "./InstallPrompt";

const resetInstallPromptState = () => {
  const scopedWindow = window as typeof window & {
    __matchopsInstallPromptListeners?: Set<(event: Event) => void>;
    __matchopsDeferredInstallPrompt?: Event | null;
    __matchopsInstallPromptListenerRegistered?: boolean;
  };

  scopedWindow.__matchopsDeferredInstallPrompt = null;
  scopedWindow.__matchopsInstallPromptListenerRegistered = false;
  scopedWindow.__matchopsInstallPromptListeners?.clear();
};

interface TestInstallEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
  preventDefault: () => void;
}

function dispatchInstallEvent(promptMock: jest.Mock) {
  const event = new Event("beforeinstallprompt") as TestInstallEvent;
  event.preventDefault = jest.fn();
  event.prompt = promptMock;
  event.userChoice = Promise.resolve({ outcome: "accepted" });
  window.dispatchEvent(event);
}

describe("InstallPrompt", () => {
  beforeEach(() => {
    resetInstallPromptState();
    localStorage.clear();
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      value: jest.fn().mockReturnValue({
        matches: false,
        addListener: jest.fn(),
        removeListener: jest.fn(),
      }),
    });
  });

  it("shows and handles install prompt", async () => {
    const promptMock = jest.fn().mockResolvedValue(undefined);
    await act(async () => {
      render(<InstallPrompt />);
    });

    act(() => {
      dispatchInstallEvent(promptMock);
    });

    const installBtn = await screen.findByText("Asenna");
    await act(async () => {
      fireEvent.click(installBtn);
    });

    expect(promptMock).toHaveBeenCalled();
  });

  it("shows prompt if event fired before component mounts", async () => {
    const promptMock = jest.fn().mockResolvedValue(undefined);
    dispatchInstallEvent(promptMock);

    await act(async () => {
      render(<InstallPrompt />);
    });

    const installBtn = await screen.findByText("Asenna");
    expect(installBtn).toBeInTheDocument();
  });

  it("dismisses the prompt", async () => {
    await act(async () => {
      render(<InstallPrompt />);
    });
    act(() => {
      dispatchInstallEvent(jest.fn());
    });
    const dismissBtn = await screen.findByText("Ei nyt");
    await act(async () => {
      fireEvent.click(dismissBtn);
    });
    expect(localStorage.getItem("installPromptDismissed")).not.toBeNull();
  });
});
