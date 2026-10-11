package com.mumu.flowers;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Matrix;
import android.net.Uri;
import android.provider.MediaStore;
import android.util.Base64;
import androidx.activity.result.ActivityResult;
import androidx.exifinterface.media.ExifInterface;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

@CapacitorPlugin(name = "GalleryPicker")
public class GalleryPickerPlugin extends Plugin {
    private final ExecutorService images = Executors.newSingleThreadExecutor();

    @PluginMethod
    public void pick(PluginCall call) {
        // ACTION_PICK opens the device's gallery rather than the restricted document picker.
        Intent intent = new Intent(Intent.ACTION_PICK);
        intent.setDataAndType(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, "image/*");
        intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
        try {
            startActivityForResult(call, intent, "selected");
        } catch (ActivityNotFoundException error) {
            call.reject("这台设备没有可用的相册应用", "NO_GALLERY");
        }
    }

    @ActivityCallback
    private void selected(PluginCall call, ActivityResult result) {
        if (call == null) return;
        Uri uri = result.getData() == null ? null : result.getData().getData();
        if (result.getResultCode() != Activity.RESULT_OK || uri == null) {
            JSObject cancelled = new JSObject();
            cancelled.put("cancelled", true);
            call.resolve(cancelled);
            return;
        }
        images.execute(() -> {
            Bitmap bitmap = null;
            try (InputStream input = getContext().getContentResolver().openInputStream(uri)) {
                if (input == null) throw new IllegalArgumentException("无法读取选中的图片");
                ByteArrayOutputStream original = new ByteArrayOutputStream();
                byte[] buffer = new byte[8192];
                int count;
                while ((count = input.read(buffer)) != -1) {
                    if (original.size() + count > 30 * 1024 * 1024)
                        throw new IllegalArgumentException("照片超过 30 MB，请选择较小的图片");
                    original.write(buffer, 0, count);
                }
                byte[] bytes = original.toByteArray();
                BitmapFactory.Options options = new BitmapFactory.Options();
                options.inJustDecodeBounds = true;
                BitmapFactory.decodeByteArray(bytes, 0, bytes.length, options);
                if (options.outWidth <= 0 || options.outHeight <= 0)
                    throw new IllegalArgumentException("无法读取此图片，请选择其他照片");
                options.inSampleSize = 1;
                while (Math.max(options.outWidth, options.outHeight) / options.inSampleSize > 2880)
                    options.inSampleSize *= 2;
                options.inJustDecodeBounds = false;
                bitmap = BitmapFactory.decodeByteArray(bytes, 0, bytes.length, options);
                if (bitmap == null) throw new IllegalArgumentException("无法解码图片");
                int orientation = new ExifInterface(new ByteArrayInputStream(bytes))
                    .getAttributeInt(ExifInterface.TAG_ORIENTATION, ExifInterface.ORIENTATION_NORMAL);
                Matrix matrix = new Matrix();
                switch (orientation) {
                    case ExifInterface.ORIENTATION_FLIP_HORIZONTAL: matrix.setScale(-1, 1); break;
                    case ExifInterface.ORIENTATION_ROTATE_180: matrix.setRotate(180); break;
                    case ExifInterface.ORIENTATION_FLIP_VERTICAL: matrix.setScale(1, -1); break;
                    case ExifInterface.ORIENTATION_TRANSPOSE: matrix.setRotate(90); matrix.postScale(-1, 1); break;
                    case ExifInterface.ORIENTATION_ROTATE_90: matrix.setRotate(90); break;
                    case ExifInterface.ORIENTATION_TRANSVERSE: matrix.setRotate(270); matrix.postScale(-1, 1); break;
                    case ExifInterface.ORIENTATION_ROTATE_270: matrix.setRotate(270); break;
                }
                float ratio = Math.min(1f, 1440f / Math.max(bitmap.getWidth(), bitmap.getHeight()));
                matrix.postScale(ratio, ratio);
                Bitmap normalized = Bitmap.createBitmap(bitmap, 0, 0, bitmap.getWidth(), bitmap.getHeight(), matrix, true);
                if (normalized != bitmap) bitmap.recycle();
                bitmap = normalized;
                ByteArrayOutputStream jpeg = new ByteArrayOutputStream();
                bitmap.compress(Bitmap.CompressFormat.JPEG, 80, jpeg);
                if (jpeg.size() > 1050000) {
                    jpeg.reset();
                    bitmap.compress(Bitmap.CompressFormat.JPEG, 55, jpeg);
                }
                if (jpeg.size() > 1350000) throw new IllegalArgumentException("照片仍然过大，请选择其他图片");
                JSObject selected = new JSObject();
                selected.put("dataUrl", "data:image/jpeg;base64," + Base64.encodeToString(jpeg.toByteArray(), Base64.NO_WRAP));
                call.resolve(selected);
            } catch (Exception error) {
                call.reject("相册图片读取失败：" + error.getMessage(), "PHOTO_READ_FAILED", error);
            } finally {
                if (bitmap != null && !bitmap.isRecycled()) bitmap.recycle();
            }
        });
    }

    @Override
    protected void handleOnDestroy() {
        images.shutdown();
    }
}
