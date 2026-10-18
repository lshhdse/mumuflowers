package com.mumu.flowers;

import com.getcapacitor.BridgeActivity;
import android.content.res.Configuration;
import android.graphics.Color;
import android.graphics.drawable.ColorDrawable;
import android.os.Build;
import android.os.Bundle;
import android.os.SystemClock;
import android.view.Display;
import android.view.View;
import android.view.WindowManager;
import androidx.core.splashscreen.SplashScreen;
import androidx.core.view.WindowCompat;

public class MainActivity extends BridgeActivity {
    private boolean launchReady = false;
    private boolean reduceLaunchMotion = false;
    private Boolean darkAppearance = null;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        SplashScreen splash = SplashScreen.installSplashScreen(this);
        long launchedAt = SystemClock.uptimeMillis();
        splash.setKeepOnScreenCondition(() -> !launchReady && SystemClock.uptimeMillis() - launchedAt < 10000);
        registerPlugin(GalleryPickerPlugin.class);
        registerPlugin(UpdateInstallerPlugin.class);
        registerPlugin(LaunchScreenPlugin.class);
        registerPlugin(DirectAiPlugin.class);
        super.onCreate(savedInstanceState);
        splash.setOnExitAnimationListener(provider -> provider.getView().animate()
            .alpha(0f).setDuration(reduceLaunchMotion ? 0 : 160).withEndAction(provider::remove).start());
    }

    public void finishLaunch(boolean reducedMotion) {
        reduceLaunchMotion = reducedMotion;
        launchReady = true;
    }

    public void setAppearance(boolean dark) {
        darkAppearance = dark;
        applyAppearance();
    }

    private void applyAppearance() {
        if (darkAppearance == null) return;
        int background = Color.parseColor(darkAppearance ? "#17251E" : "#F6F7F2");
        var window = getWindow();
        window.setBackgroundDrawable(new ColorDrawable(background));
        window.getDecorView().setBackgroundColor(background);
        window.setStatusBarColor(background);
        window.setNavigationBarColor(background);
        if (Build.VERSION.SDK_INT >= 29) {
            window.setStatusBarContrastEnforced(false);
            // Preserve Android's contrast protection for three-button navigation.
            window.setNavigationBarContrastEnforced(true);
        }
        var insets = WindowCompat.getInsetsController(window, window.getDecorView());
        insets.setAppearanceLightStatusBars(!darkAppearance);
        insets.setAppearanceLightNavigationBars(!darkAppearance);
        if (bridge != null) bridge.getWebView().setBackgroundColor(background);
    }

    @Override
    public void onConfigurationChanged(Configuration configuration) {
        super.onConfigurationChanged(configuration);
        getWindow().getDecorView().post(this::applyAppearance);
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (!hasFocus) return;
        applyAppearance();
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
