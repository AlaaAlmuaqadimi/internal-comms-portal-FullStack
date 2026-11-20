import React from 'react';
import { Modal } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useCall } from '../../context/CallContext';
import { PHASES } from '../../calls/callMachine';
import IncomingCallScreen from '../../screens/main/IncomingCallScreen';
import CallActiveScreen from '../../screens/main/CallActiveScreen';

/**
 * Shows the live call above whatever screen is open, so an incoming call
 * appears anywhere in the app without touching the navigation stack.
 */
const CallOverlay = () => {
  const { state, systemCalls } = useCall();
  // With the phone's call UI, ringing shows only there (banner when in use,
  // full screen when locked); showing ours too would duplicate it.
  const visible =
    state.phase !== PHASES.IDLE && !(systemCalls && state.phase === PHASES.INCOMING);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      statusBarTranslucent
      // The Android back button must not hide a live call; the user answers,
      // declines or hangs up with the buttons.
      onRequestClose={() => {}}
    >
      {/* Modals render in their own root on Android, so they need their own
          safe-area provider. */}
      <SafeAreaProvider>
        {state.phase === PHASES.INCOMING ? <IncomingCallScreen /> : <CallActiveScreen />}
      </SafeAreaProvider>
    </Modal>
  );
};

export default CallOverlay;
