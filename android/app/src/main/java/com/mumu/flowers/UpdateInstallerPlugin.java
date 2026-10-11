package com.mumu.flowers;

import android.app.DownloadManager;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.content.pm.Signature;
import android.database.Cursor;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.Settings;
import androidx.activity.result.ActivityResult;
import androidx.core.content.FileProvider;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;
import java.io.FileInputStream;
import java.security.MessageDigest;
import java.util.Arrays;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/** DownloadManager owns the transfer, including while the WebView or app process is stopped. */
@CapacitorPlugin(name = "UpdateInstaller")
public class UpdateInstallerPlugin extends Plugin {
    private final ExecutorService worker = Executors.newSingleThreadExecutor();
    private long verifiedId = -1;
    private long verifiedModified = -1;
    private SharedPreferences preferences() {
        return getContext().getSharedPreferences("mumu-updates", Context.MODE_PRIVATE);
    }
    private DownloadManager downloads() {
        return (DownloadManager) getContext().getSystemService(Context.DOWNLOAD_SERVICE);
    }
    private File apkFile(String version) throws Exception {
        if (!version.matches("[0-9]+\\.[0-9]+\\.[0-9]+")) throw new Exception("版本信息无效");
        File directory = getContext().getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS);
        if (directory == null) throw new Exception("没有可用的下载空间");
        return new File(directory, "updates/MuMu-Flowers-" + version + ".apk");
    }
    private JSObject state(String status) {
        JSObject result = new JSObject();
        result.put("status", status);
        result.put("version", preferences().getString("version", ""));
        return result;
    }

    @PluginMethod
    public void start(PluginCall call) {
        worker.execute(() -> {
            try {
                String version = call.getString("version", "");
                String url = call.getString("url", "");
                String sha256 = call.getString("sha256", "");
                long size = call.getLong("size", 0L);
                String expectedUrl = "https://github.com/lshhdse/mumuflowers/releases/download/v"
                    + version + "/MuMu-Flowers-" + version + ".apk";
                File file = apkFile(version);
                if (!expectedUrl.equals(url) || !sha256.matches("[a-fA-F0-9]{64}")
                    || size <= 0 || size > 100 * 1024 * 1024)
                    throw new Exception("更新安装包信息校验失败，请重新检查更新");
                SharedPreferences prefs = preferences();
                if (version.equals(prefs.getString("version", ""))
                    && sha256.equalsIgnoreCase(prefs.getString("sha256", ""))
                    && size == prefs.getLong("size", 0)) {
                    JSObject existing;
                    try { existing = readStatus(); }
                    catch (Exception error) { existing = failed(error.getMessage()); }
                    if (!"failed".equals(existing.getString("status"))
                        && !"idle".equals(existing.getString("status"))) {
                        call.resolve(existing);
                        return;
                    }
                }
                removeOwnDownload();
                File parent = file.getParentFile();
                if (parent == null || (!parent.isDirectory() && !parent.mkdirs()))
                    throw new Exception("无法创建更新目录");
                if (file.exists() && !file.delete()) throw new Exception("无法清理旧的安装包");
                DownloadManager.Request request = new DownloadManager.Request(Uri.parse(url))
                    .setTitle("MuMu Flowers " + version)
                    .setDescription("正在下载更新，完成后回到 MuMu Flowers 安装")
                    .setMimeType("application/vnd.android.package-archive")
                    .setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE)
                    .setDestinationInExternalFilesDir(getContext(), Environment.DIRECTORY_DOWNLOADS,
                        "updates/" + file.getName());
                long id = downloads().enqueue(request);
                prefs.edit().putLong("id", id).putString("version", version)
                    .putString("sha256", sha256.toLowerCase(java.util.Locale.ROOT))
                    .putLong("size", size).remove("error").apply();
                call.resolve(readStatus());
            } catch (Exception error) {
                call.reject(error.getMessage(), "UPDATE_DOWNLOAD_FAILED", error);
            }
        });
    }

    @PluginMethod
    public void status(PluginCall call) {
        worker.execute(() -> {
            try { call.resolve(readStatus()); }
            catch (Exception error) { call.resolve(failed(error.getMessage())); }
        });
    }

    private JSObject readStatus() throws Exception {
        SharedPreferences prefs = preferences();
        String error = prefs.getString("error", "");
        if (!error.isEmpty()) {
            JSObject result = state("failed");
            result.put("message", error);
            return result;
        }
        long id = prefs.getLong("id", -1);
        if (id < 0) return state("idle");
        try (Cursor cursor = downloads().query(new DownloadManager.Query().setFilterById(id))) {
            if (cursor == null || !cursor.moveToFirst()) return failed("安装包已被移除，请重新下载");
            int status = cursor.getInt(cursor.getColumnIndexOrThrow(DownloadManager.COLUMN_STATUS));
            long received = cursor.getLong(cursor.getColumnIndexOrThrow(DownloadManager.COLUMN_BYTES_DOWNLOADED_SO_FAR));
            long total = prefs.getLong("size", 0);
            if (status == DownloadManager.STATUS_FAILED) return failed("下载未完成，请检查网络和剩余空间后重试");
            if (status == DownloadManager.STATUS_SUCCESSFUL) {
                File file = apkFile(prefs.getString("version", ""));
                if (verifiedId != id || verifiedModified != file.lastModified() || file.length() != total) {
                    JSObject verifying = state("verifying");
                    verifying.put("received", total);
                    verifying.put("total", total);
                    notifyListeners("progress", verifying);
                    verify(file);
                    verifiedId = id;
                    verifiedModified = file.lastModified();
                }
                JSObject result = state("ready");
                result.put("received", total);
                result.put("total", total);
                return result;
            }
            JSObject result = state(status == DownloadManager.STATUS_PAUSED ? "paused" : "downloading");
            result.put("received", received);
            result.put("total", total);
            if (status == DownloadManager.STATUS_PAUSED)
                result.put("message", "正在等待网络恢复，安装包会继续下载");
            return result;
        }
    }

    private JSObject failed(String message) {
        preferences().edit().putString("error", message).apply();
        JSObject result = state("failed");
        result.put("message", message);
        return result;
    }

    @SuppressWarnings("deprecation")
    private void verify(File file) throws Exception {
        SharedPreferences prefs = preferences();
        if (!file.isFile() || file.length() != prefs.getLong("size", 0))
            throw new Exception("安装包不完整，请重新下载");
        MessageDigest hash = MessageDigest.getInstance("SHA-256");
        try (FileInputStream input = new FileInputStream(file)) {
            byte[] buffer = new byte[65536];
            int count;
            while ((count = input.read(buffer)) != -1) hash.update(buffer, 0, count);
        }
        if (!hex(hash.digest()).equals(prefs.getString("sha256", "")))
            throw new Exception("安装包校验失败，请重新下载");
        PackageManager manager = getContext().getPackageManager();
        int flags = Build.VERSION.SDK_INT >= 28 ? PackageManager.GET_SIGNING_CERTIFICATES : PackageManager.GET_SIGNATURES;
        PackageInfo archive = manager.getPackageArchiveInfo(file.getAbsolutePath(), flags);
        PackageInfo current = manager.getPackageInfo(getContext().getPackageName(), flags);
        if (archive == null || !current.packageName.equals(archive.packageName)
            || !prefs.getString("version", "").equals(archive.versionName))
            throw new Exception("安装包与 MuMu Flowers 不匹配");
        long nextCode = Build.VERSION.SDK_INT >= 28 ? archive.getLongVersionCode() : archive.versionCode;
        long currentCode = Build.VERSION.SDK_INT >= 28 ? current.getLongVersionCode() : current.versionCode;
        if (nextCode < currentCode) throw new Exception("不能安装较旧的版本，请重新检查更新");
        Signature[] next = Build.VERSION.SDK_INT >= 28
            ? (archive.signingInfo == null ? null : archive.signingInfo.getApkContentsSigners()) : archive.signatures;
        Signature[] installed = Build.VERSION.SDK_INT >= 28
            ? (current.signingInfo == null ? null : current.signingInfo.getApkContentsSigners()) : current.signatures;
        if (next == null || installed == null || next.length != installed.length)
            throw new Exception("安装包签名不匹配，请重新检查更新");
        String[] a = Arrays.stream(next).map(Signature::toCharsString).sorted().toArray(String[]::new);
        String[] b = Arrays.stream(installed).map(Signature::toCharsString).sorted().toArray(String[]::new);
        if (!Arrays.equals(a, b)) throw new Exception("安装包签名不匹配，请重新检查更新");
    }

    private static String hex(byte[] bytes) {
        StringBuilder result = new StringBuilder();
        for (byte value : bytes) result.append(String.format(java.util.Locale.ROOT, "%02x", value & 0xff));
        return result.toString();
    }

    @PluginMethod
    public void install(PluginCall call) {
        worker.execute(() -> {
            try {
                if (!"ready".equals(readStatus().getString("status")))
                    throw new Exception("请先完成安装包下载");
                // Recheck immediately before granting another process access to the file.
                verify(apkFile(preferences().getString("version", "")));
                getActivity().runOnUiThread(() -> {
                    try {
                        if (Build.VERSION.SDK_INT >= 26 && !getContext().getPackageManager().canRequestPackageInstalls()) {
                            Intent permission = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                                Uri.parse("package:" + getContext().getPackageName()));
                            startActivityForResult(call, permission, "installPermissionReturned");
                        } else openInstaller(call);
                    } catch (Exception error) { call.reject("无法打开安装界面：" + error.getMessage()); }
                });
            } catch (Exception error) { call.reject(error.getMessage(), "UPDATE_INSTALL_FAILED", error); }
        });
    }

    @ActivityCallback
    private void installPermissionReturned(PluginCall call, ActivityResult result) {
        if (call == null) return;
        if (Build.VERSION.SDK_INT >= 26 && !getContext().getPackageManager().canRequestPackageInstalls()) {
            JSObject denied = state("permission");
            denied.put("message", "安装包已保存，允许此来源安装后可继续安装");
            call.resolve(denied);
            return;
        }
        // Revalidate after the user has left and returned from Settings.
        install(call);
    }

    private void openInstaller(PluginCall call) throws Exception {
        Uri uri = FileProvider.getUriForFile(getContext(), getContext().getPackageName() + ".fileprovider",
            apkFile(preferences().getString("version", "")));
        Intent intent = new Intent(Intent.ACTION_VIEW).setDataAndType(uri, "application/vnd.android.package-archive");
        intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
        getActivity().startActivity(intent);
        call.resolve(state("installing"));
    }

    @PluginMethod
    public void cancel(PluginCall call) {
        worker.execute(() -> {
            try { removeOwnDownload(); call.resolve(state("idle")); }
            catch (Exception error) { call.reject("无法取消下载：" + error.getMessage()); }
        });
    }
    private void removeOwnDownload() throws Exception {
        SharedPreferences prefs = preferences();
        long id = prefs.getLong("id", -1);
        if (id >= 0) downloads().remove(id);
        String version = prefs.getString("version", "");
        if (!version.isEmpty()) {
            File file = apkFile(version);
            if (file.exists() && !file.delete()) throw new Exception("无法清理旧的安装包");
        }
        prefs.edit().clear().apply();
        verifiedId = -1;
        verifiedModified = -1;
    }
    @Override protected void handleOnDestroy() { worker.shutdown(); }
}
