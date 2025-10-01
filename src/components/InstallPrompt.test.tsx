import React from "react";
import { render, screen, fireEvent, act, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";
import "@/i18n";
import InstallPrompt from "./InstallPrompt";

// Mock the storage module
jest.mock("@/utils/storage");

// Import mocked functions after jest.mock
import { setStorageItem } from "@/utils/storage";
import { clearMockStore } from "@/utils/__mocks__/storage";

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
    clearMockStore();
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

    const installBtn = await screen.findByText("Install");
    await act(async () => {
      fireEvent.click(installBtn);
    });

    expect(promptMock).toHaveBeenCalled();
  });

  it("dismisses the prompt", async () => {
    await act(async () => {
      render(<InstallPrompt />);
    });

    // Dispatch install event
    await act(async () => {
      dispatchInstallEvent(jest.fn());
    });

    // Wait for the install prompt to appear
    const dismissBtn = await screen.findByText("Not now");

    await act(async () => {
      fireEvent.click(dismissBtn);
    });

    // Wait for async storage operation to complete
    await waitFor(() => {
      expect(setStorageItem).toHaveBeenCalledWith(
        "installPromptDismissed",
        expect.any(String)
      );
    });
  });
});
