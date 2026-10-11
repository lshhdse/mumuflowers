package com.mumu.flowers;

import com.getcapacitor.BridgeActivity;
import android.os.Build;
import android.os.Bundle;
import android.view.Display;
import android.view.View;
import android.view.WindowManager;
import androidx.core.splashscreen.SplashScreen;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        SplashScreen splash = SplashScreen.installSplashScreen(this);
        registerPlugin(GalleryPickerPlugin.class);
        registerPlugin(UpdateInstallerPlugin.class);
        super.onCreate(savedInstanceState);
        splash.setOnExitAnimationListener(provider -> provider.getView().animate()
            .alpha(0f).setDuration(160).withEndAction(provider::remove).start());
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (!hasFocus) return;
        Display display = getWindowManager().getDefaultDisplay();
        Display.Mode current = display.getMode();
        float availableRate = current.getRefreshRate();
        for (Display.Mode mode : display.getSupportedModes()) {
            if (mode.getPhysicalWidth() == current.getPhysicalWidth()
                    && mode.getPhysicalHeight() == current.getPhysicalHeight()) {
                availableRate = Math.max(availableRate, mode.getRefreshRate());
            }
        }
        // Request a high refresh rate without changing screen resolution or overriding system policy.
        WindowManager.LayoutParams attributes = getWindow().getAttributes();
        attributes.preferredRefreshRate = Math.min(120f, availableRate);
        getWindow().setAttributes(attributes);
        if (Build.VERSION.SDK_INT >= 35 && bridge != null) {
            bridge.getWebView().setRequestedFrameRate(View.REQUESTED_FRAME_RATE_CATEGORY_HIGH);
        }
    }
}
