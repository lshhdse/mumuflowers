package com.mumu.flowers;

import android.content.Intent;
import android.os.Build;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import org.json.JSONArray;
import org.json.JSONObject;
import java.util.UUID;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

@CapacitorPlugin(name = "DirectAi")
public class DirectAiPlugin extends Plugin {
    private final ExecutorService worker = Executors.newCachedThreadPool();
    private interface Action { JSONObject run(AiStore store) throws Exception; }
    private void execute(PluginCall call, Action action) {
        worker.execute(() -> {
            try { call.resolve(new JSObject(action.run(new AiStore(getContext())).toString())); }
            catch (Exception error) { call.reject(error.getMessage() == null ? "AI 操作未完成，请重试" : error.getMessage()); }
        });
    }
    @PluginMethod public void settings(PluginCall call) { execute(call, AiStore::publicSettings); }
    @PluginMethod public void save(PluginCall call) { execute(call, store -> store.saveSettings(call.getData())); }
    @PluginMethod public void test(PluginCall call) {
        execute(call, store -> {
            JSONObject result = AiClient.request(store, store.settingsFor(call.getData()),
                new JSONArray().put(new JSONObject().put("role", "user").put("content", "请回复：连接成功")), UUID.randomUUID().toString(), true);
            if (result.optJSONArray("choices") == null || result.getJSONArray("choices").length() == 0)
                throw new Exception("服务响应缺少结果，请检查接口格式");
            return new JSONObject().put("message", "模型连接成功；植物分析还需要该模型支持图片识别");
        });
    }
    @PluginMethod public void jobs(PluginCall call) { execute(call, store -> new JSONObject().put("jobs", store.jobs(call.getArray("ids")))); }
    private void cancel(AiStore store, String id) throws Exception {
        synchronized (AiStore.LOCK) {
            JSONObject job = store.readJob(id);
            if (job == null || (!job.optString("status").equals("queued") && !job.optString("status").equals("running"))) return;
            store.finish(id, "cancelled", null, null);
            AiClient.cancel(id);
        }
    }
    @PluginMethod public void cancel(PluginCall call) {
        execute(call, store -> { cancel(store, call.getString("id", "")); return new JSONObject(); });
    }
    @PluginMethod public void clearKey(PluginCall call) {
        execute(call, store -> {
            JSONArray jobs = store.jobs();
            for (int i = 0; i < jobs.length(); i++) cancel(store, jobs.getJSONObject(i).getString("id"));
            return store.clearKey();
        });
    }
    @PluginMethod public void start(PluginCall call) {
        execute(call, store -> {
            String id = call.getString("id", "");
            synchronized (AiStore.LOCK) {
                JSONObject existing = store.readJob(id);
                if (existing != null) return store.publicJob(existing);
                JSONObject payload = call.getObject("payload");
                if (payload == null || payload.toString().length() > 4000000) throw new Exception("分析照片过大，请重新选择");
                JSONArray photos = payload.getJSONArray("photos");
                if (photos.length() < 1 || photos.length() > 2) throw new Exception("请选择植物照片，最多附带一张盆土照片");
                for (int i = 0; i < photos.length(); i++) {
                    JSONObject photo = photos.getJSONObject(i);
                    if (!photo.getString("dataUrl").matches("^data:image/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$"))
                        throw new Exception("照片格式无效，请重新选择");
                }
                JSONObject config = store.settingsFor(new JSONObject());
                long now = System.currentTimeMillis();
                JSONObject job = new JSONObject().put("id", id).put("plantId", call.getString("plantId", ""))
                    .put("status", "queued").put("createdAt", now).put("updatedAt", now).put("payload", payload).put("config", config);
                store.writeJob(job);
                try {
                    Intent intent = new Intent(getContext(), AiService.class).putExtra("id", id);
                    if (Build.VERSION.SDK_INT >= 26) getContext().startForegroundService(intent); else getContext().startService(intent);
                } catch (Exception error) {
                    store.finish(id, "failed", null, "无法启动后台分析，请保持 App 在前台后重试");
                    throw new Exception("无法启动后台分析，请保持 App 在前台后重试");
                }
                return store.publicJob(job);
            }
        });
    }
}
