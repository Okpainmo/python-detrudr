import { createSlice, PayloadAction } from '@reduxjs/toolkit';

/**
 * Configuration for the primary action button
 */
interface ModalAction {
  label: string;
  onClickAction?: string; // Identifier for the component to handle the specific action
}

interface GlobalModalState {
  isOpen: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel: string;
  isLoading: boolean;
  /**
   * Action type helps listeners (components) identify which operation was confirmed.
   * Useful when the confirmation logic resides in the component dispatching the modal.
   */
  actionType: string | null;
}

const initialState: GlobalModalState = {
  isOpen: false,
  title: '',
  message: '',
  confirmLabel: 'Confirm',
  cancelLabel: 'Cancel',
  isLoading: false,
  actionType: null,
};

const globalModalSlice = createSlice({
  name: 'globalModal',
  initialState,
  reducers: {
    /**
     * Opens the global modal with custom configuration
     */
    openGlobalModal: (
      state,
      action: PayloadAction<{
        title: string;
        message: string;
        confirmLabel?: string;
        cancelLabel?: string;
        actionType?: string;
      }>,
    ) => {
      state.isOpen = true;
      state.title = action.payload.title;
      state.message = action.payload.message;
      state.confirmLabel = action.payload.confirmLabel || 'Confirm';
      state.cancelLabel = action.payload.cancelLabel || 'Cancel';
      state.actionType = action.payload.actionType || null;
      state.isLoading = false;
    },

    /**
     * Closes the global modal and resets its state
     */
    closeGlobalModal: (state) => {
      state.isOpen = false;
      // We keep the labels/titles until next open to avoid flicker during closing animation
      state.actionType = null;
      state.isLoading = false;
    },

    /**
     * Sets the loading state for the confirm button
     */
    setModalLoading: (state, action: PayloadAction<boolean>) => {
      state.isLoading = action.payload;
    },
  },
});

export const { openGlobalModal, closeGlobalModal, setModalLoading } =
  globalModalSlice.actions;

export default globalModalSlice.reducer;
