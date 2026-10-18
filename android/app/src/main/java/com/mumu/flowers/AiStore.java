package com.mumu.flowers;

import android.content.Context;
import android.content.SharedPreferences;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.AtomicFile;
import android.util.Base64;
import org.json.JSONArray;
import org.json.JSONObject;
import java.io.File;
import java.nio.charset.StandardCharsets;
import java.net.URI;
import java.security.KeyStore;
import java.util.UUID;
import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

final class AiStore {
    static final Object LOCK = new Object();
    private final SharedPreferences preferences;
    private final File directory;
    AiStore(Context context) {
        preferences = context.getSharedPreferences("mumu-direct-ai", Context.MODE_PRIVATE);
        directory = new File(context.getFilesDir(), "ai-jobs");
    }
    private SecretKey key() throws Exception {
        KeyStore store = KeyStore.getInstance("AndroidKeyStore");
        store.load(null);
        String alias = "mumu.flowers.ai.v1";
        if (!store.containsAlias(alias)) {
            KeyGenerator generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");
            generator.init(new KeyGenParameterSpec.Builder(alias, KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).build());
            generator.generateKey();
        }
        return (SecretKey) store.getKey(alias, null);
    }
    private String encrypt(String value) throws Exception {
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.ENCRYPT_MODE, key());
        return Base64.encodeToString(cipher.getIV(), Base64.NO_WRAP) + ":" +
            Base64.encodeToString(cipher.doFinal(value.getBytes(StandardCharsets.UTF_8)), Base64.NO_WRAP);
    }
    String decrypt(String value) throws Exception {
        if (value.isEmpty()) return "";
        String[] parts = value.split(":");
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.DECRYPT_MODE, key(), new GCMParameterSpec(128, Base64.decode(parts[0], Base64.NO_WRAP)));
        return new String(cipher.doFinal(Base64.decode(parts[1], Base64.NO_WRAP)), StandardCharsets.UTF_8);
    }
    JSONObject publicSettings() throws Exception {
        synchronized (LOCK) {
            return new JSONObject().put("baseUrl", preferences.getString("baseUrl", "https://api.openai.com/v1"))
                .put("model", preferences.getString("model", "gpt-4.1-mini"))
                .put("hasKey", !preferences.getString("encryptedKey", "").isEmpty());
        }
    }
    static String baseUrl(String raw) throws Exception {
        String base = raw.trim().replaceAll("/+$", "");
        URI uri;
        try { uri = new URI(base); } catch (Exception error) { throw new Exception("请填写正确的服务 URL"); }
        boolean local = "http".equals(uri.getScheme()) &&
            ("localhost".equals(uri.getHost()) || "127.0.0.1".equals(uri.getHost()) || "10.0.2.2".equals(uri.getHost()));
        if (base.length() > 2000 || (!"https".equals(uri.getScheme()) && !local) || uri.getHost() == null ||
            uri.getUserInfo() != null || uri.getQuery() != null || uri.getFragment() != null)
            throw new Exception("服务 URL 需要 HTTPS，且不能包含密钥或查询参数");
        return base;
    }
    JSONObject settingsFor(JSONObject input) throws Exception {
        synchronized (LOCK) {
            JSONObject saved = publicSettings();
            String base = baseUrl(input.optString("baseUrl", saved.getString("baseUrl")));
            String model = input.optString("model", saved.getString("model")).trim();
            String apiKey = input.optString("apiKey", "").trim();
            if (model.isEmpty() || model.length() > 120) throw new Exception("请填写模型名称（最多 120 字符）");
            if (apiKey.length() > 8192 || apiKey.contains("\r") || apiKey.contains("\n")) throw new Exception("API Key 格式不正确");
            String encrypted = preferences.getString("encryptedKey", "");
            if (!apiKey.isEmpty()) encrypted = encrypt(apiKey);
            else if (!base.equals(saved.getString("baseUrl"))) throw new Exception("更换服务 URL 时，请同时填写新服务的 API Key");
            if (encrypted.isEmpty()) throw new Exception("请先填写 API Key");
            return new JSONObject().put("baseUrl", base).put("model", model).put("encryptedKey", encrypted);
        }
    }
    JSONObject saveSettings(JSONObject input) throws Exception {
        synchronized (LOCK) {
            JSONObject config = settingsFor(input);
            if (!preferences.edit().putString("baseUrl", config.getString("baseUrl"))
                .putString("model", config.getString("model")).putString("encryptedKey", config.getString("encryptedKey")).commit())
                throw new Exception("AI 设置保存失败，请重试");
            return publicSettings();
        }
    }
    JSONObject clearKey() throws Exception {
        synchronized (LOCK) {
            if (!preferences.edit().remove("encryptedKey").commit()) throw new Exception("密钥清除失败，请重试");
            return publicSettings();
        }
    }
    private File file(String id) throws Exception {
        if (!UUID.fromString(id).toString().equals(id)) throw new Exception("分析编号无效");
        return new File(directory, id + ".json");
    }
    JSONObject readJob(String id) throws Exception {
        synchronized (LOCK) {
            AtomicFile file = new AtomicFile(file(id));
            if (!file.getBaseFile().exists()) return null;
            return new JSONObject(new String(file.readFully(), StandardCharsets.UTF_8));
        }
    }
    void writeJob(JSONObject job) throws Exception {
        synchronized (LOCK) {
            if (!directory.exists() && !directory.mkdirs()) throw new Exception("无法保存后台分析任务");
            AtomicFile file = new AtomicFile(file(job.getString("id")));
            java.io.FileOutputStream output = file.startWrite();
            try { output.write(job.toString().getBytes(StandardCharsets.UTF_8)); file.finishWrite(output); }
            catch (Exception error) { file.failWrite(output); throw error; }
        }
    }
    JSONObject publicJob(JSONObject job) throws Exception {
        JSONObject result = new JSONObject();
        for (String field : new String[] { "id", "plantId", "status", "createdAt", "updatedAt", "result", "error" })
            if (job.has(field)) result.put(field, job.get(field));
        return result;
    }
    JSONArray jobs() throws Exception {
        return jobs(null);
    }
    JSONArray jobs(JSONArray ids) throws Exception {
        synchronized (LOCK) {
            JSONArray result = new JSONArray();
            File[] files = directory.listFiles((dir, name) -> name.endsWith(".json"));
            if (ids != null) {
                if (ids.length() > 2000) throw new Exception("任务查询过多");
                files = new File[ids.length()];
                for (int i = 0; i < ids.length(); i++) files[i] = file(ids.getString(i));
            }
            if (files == null) return result;
            for (File file : files) {
                JSONObject job = readJob(file.getName().replace(".json", ""));
                if (job == null) continue;
                String status = job.optString("status");
                if (!AiService.active && (status.equals("running") || status.equals("queued")) &&
                    System.currentTimeMillis() - job.optLong("updatedAt") > 10000) {
                    job = finish(job.getString("id"), "failed", null, "上次分析已中断，点击重试可重新分析");
                }
                result.put(publicJob(job));
            }
            return result;
        }
    }
    JSONObject finish(String id, String status, JSONObject result, String error) throws Exception {
        synchronized (LOCK) {
            JSONObject job = readJob(id);
            if (job == null || job.optString("status").equals("cancelled")) return job;
            job.put("status", status).put("updatedAt", System.currentTimeMillis());
            if (result != null) job.put("result", result);
            if (error != null) job.put("error", error);
            job.remove("payload"); job.remove("config");
            writeJob(job);
            return job;
        }
    }
}
