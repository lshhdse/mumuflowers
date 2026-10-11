package com.mumu.flowers;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "LaunchScreen")
public class LaunchScreenPlugin extends Plugin {
    @PluginMethod
    public void appearance(PluginCall call) {
        boolean dark = call.getBoolean("dark", false);
        getActivity().runOnUiThread(() -> {
            ((MainActivity) getActivity()).setAppearance(dark);
            call.resolve();
        });
    }

    @PluginMethod
    public void ready(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            ((MainActivity) getActivity()).finishLaunch(call.getBoolean("reducedMotion", false));
            call.resolve();
        });
    }
}
