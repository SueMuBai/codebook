package com.codebook.app;

import android.os.Bundle;
import android.view.WindowManager;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_SECURE);
        registerPlugin(ScreenProtectionPlugin.class);
        registerPlugin(BiometricVaultPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
