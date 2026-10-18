package com.mumu.flowers;

import android.app.Service;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Intent;
import android.os.Build;
import android.os.IBinder;
import org.json.JSONObject;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public class AiService extends Service {
    static volatile boolean active = false;
    private final ExecutorService worker = Executors.newSingleThreadExecutor();
    @Override public void onCreate() {
        super.onCreate(); active = true;
        String channel = "ai-analysis";
        if (Build.VERSION.SDK_INT >= 26) getSystemService(NotificationManager.class).createNotificationChannel(
            new NotificationChannel(channel, "AI 后台观察", NotificationManager.IMPORTANCE_LOW));
        Intent open = new Intent(this, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent pending = PendingIntent.getActivity(this, 44, open, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        Notification.Builder notification = Build.VERSION.SDK_INT >= 26 ? new Notification.Builder(this, channel) : new Notification.Builder(this);
        startForeground(4401, notification.setSmallIcon(R.drawable.ic_stat_leaf).setContentTitle("MuMu Flowers · AI 观察")
            .setContentText("正在后台分析，完成后可在花园查看").setContentIntent(pending).setOngoing(true).build());
    }
    @Override public int onStartCommand(Intent intent, int flags, int startId) {
        String id = intent == null ? null : intent.getStringExtra("id");
        worker.execute(() -> {
            AiStore store = new AiStore(this);
            try {
                JSONObject job = id == null ? null : store.readJob(id);
                if (job != null && job.optString("status").equals("queued")) {
                    synchronized (AiStore.LOCK) {
                        job = store.readJob(id);
                        if (!job.optString("status").equals("queued")) return;
                        job.put("status", "running").put("updatedAt", System.currentTimeMillis()); store.writeJob(job);
                    }
                    store.finish(id, "done", AiClient.analyze(store, job), null);
                }
            } catch (Exception error) {
                try { store.finish(id, "failed", null, error instanceof org.json.JSONException ? "AI 返回格式不正确，请确认模型支持图片识别后重试" :
                    error.getMessage() == null ? "分析未完成，请检查模型后重试" : error.getMessage()); }
                catch (Exception ignored) { }
            } finally { stopSelfResult(startId); }
        });
        // Never silently repeat a possibly paid request after a process restart.
        return START_NOT_STICKY;
    }
    @Override public void onDestroy() { active = false; worker.shutdown(); super.onDestroy(); }
    @Override public IBinder onBind(Intent intent) { return null; }
}
