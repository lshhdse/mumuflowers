import { useEffect, useState } from 'react';
import { Eye, EyeOff, LoaderCircle, ShieldCheck, Sparkles } from 'lucide-react';
import {
  getAiSettings,
  saveAiSettings,
  testAiSettings,
  clearAiKey,
  directAiSupported,
} from '../lib/direct-ai';
import { Modal } from './ui';

export function AiSettings() {
  const [input, setInput] = useState({
    baseUrl: 'https://api.openai.com/v1',
    apiKey: '',
    model: 'gpt-4.1-mini',
  });
  const [hasKey, setHasKey] = useState(false);
  const [visible, setVisible] = useState(false);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState<'save' | 'test' | 'clear' | null>(null);
  const [feedback, setFeedback] = useState<{ error: boolean; text: string } | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  useEffect(() => {
    let active = true;
    void getAiSettings()
      .then((config) => {
        if (!active) return;
        setInput({ baseUrl: config.baseUrl, model: config.model, apiKey: '' });
        setHasKey(config.hasKey);
      })
      .catch(() => {
        if (active) setFeedback({ error: true, text: '无法读取 AI 配置，请返回后重试' });
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);
  async function perform(action: 'save' | 'test' | 'clear') {
    if (working) return;
    setWorking(action);
    setFeedback(null);
    try {
      if (action === 'test') {
        const result = await testAiSettings(input);
        setFeedback({ error: false, text: result.message });
      } else {
        const config = action === 'clear' ? await clearAiKey() : await saveAiSettings(input);
        setInput({ baseUrl: config.baseUrl, model: config.model, apiKey: '' });
        setHasKey(config.hasKey);
        setVisible(false);
        setConfirmClear(false);
        setFeedback({
          error: false,
          text:
            action === 'clear'
              ? '已清除密钥，并取消未完成的本机分析'
              : directAiSupported()
                ? '设置已保存，可以去分析植物了'
                : '已保存界面预览设置；真实 AI 请在安卓 App 中配置',
        });
      }
    } catch (error) {
      setFeedback({
        error: true,
        text: error instanceof Error ? error.message : '操作未完成，请重试',
      });
    } finally {
      setWorking(null);
    }
  }
  return (
    <>
      {!directAiSupported() && (
        <p className="ai-preview-note">浏览器仅用于界面预览，真实 AI 请在安卓 App 中配置。</p>
      )}
      <form
        className="settings-panel ai-settings"
        onSubmit={(event) => {
          event.preventDefault();
          void perform('save');
        }}
      >
        <div className="ai-settings-heading">
          <h2>
            <Sparkles size={20} />
            AI 植物助手
          </h2>
          <span className="ai-settings-status">
            {loading ? '正在读取' : hasKey ? '已保存密钥' : '待配置'}
          </span>
        </div>
        <fieldset disabled={loading || Boolean(working)}>
          <label>
            服务 URL
            <input
              required
              type="url"
              inputMode="url"
              autoCapitalize="none"
              autoComplete="off"
              spellCheck={false}
              value={input.baseUrl}
              onChange={(event) => setInput({ ...input, baseUrl: event.target.value })}
              placeholder="https://…/v1"
            />
            <small>
              支持 Chat Completions 格式的 HTTPS 接口，也可填写完整的 /chat/completions 地址。
            </small>
          </label>
          <label>
            API Key
            <div className="ai-key-row">
              <input
                type={visible ? 'text' : 'password'}
                autoComplete="new-password"
                autoCapitalize="none"
                spellCheck={false}
                value={input.apiKey}
                onChange={(event) => setInput({ ...input, apiKey: event.target.value })}
                placeholder={hasKey ? '已安全保存，留空保持原密钥' : '填写你自己的 API Key'}
              />
              <button
                type="button"
                className="icon-button"
                aria-label={visible ? '隐藏新输入的密钥' : '显示新输入的密钥'}
                aria-pressed={visible}
                onClick={() => setVisible(!visible)}
              >
                {visible ? <EyeOff size={21} /> : <Eye size={21} />}
              </button>
            </div>
            <small>在手机上加密保存；更换服务 URL 时，请同时填写新服务的密钥。</small>
          </label>
          <label>
            视觉模型
            <input
              required
              maxLength={120}
              autoCapitalize="none"
              spellCheck={false}
              value={input.model}
              onChange={(event) => setInput({ ...input, model: event.target.value })}
              placeholder="填写支持图片识别的模型名称"
            />
            <small>植物和盆土分析需要模型支持图片识别。</small>
          </label>
          <div className="button-row ai-settings-actions">
            <button className="primary-button" type="submit">
              {working === 'save' && <LoaderCircle size={17} className="spin" />}
              {working === 'save' ? '正在保存…' : '保存设置'}
            </button>
            <button type="button" className="secondary-button" onClick={() => void perform('test')}>
              {working === 'test' && <LoaderCircle size={17} className="spin" />}
              {working === 'test' ? '正在测试…' : '测试连接'}
            </button>
          </div>
        </fieldset>
        {feedback && (
          <p
            className={`settings-feedback ${feedback.error ? 'is-error' : ''}`}
            role={feedback.error ? 'alert' : 'status'}
          >
            {feedback.text}
          </p>
        )}
        <p className="ai-privacy">
          <ShieldCheck size={19} />
          <span>
            点击 AI
            分析时，才会将所选照片和相关记录发送给你配置的服务，可能消耗额度。分析可在后台继续；密钥不进入花园备份。
          </span>
        </p>
        {hasKey && (
          <button
            type="button"
            className="text-button danger ai-clear-key"
            disabled={Boolean(working)}
            onClick={() => setConfirmClear(true)}
          >
            清除已保存的密钥
          </button>
        )}
      </form>
      {confirmClear && (
        <Modal title="清除 AI 密钥" onClose={() => setConfirmClear(false)}>
          <p>会清除本机保存的密钥并取消未完成的本机 AI 分析。植物、照片和已有分析记录会保留。</p>
          <div className="button-row">
            <button
              className="secondary-button"
              disabled={Boolean(working)}
              onClick={() => setConfirmClear(false)}
            >
              保留密钥
            </button>
            <button
              className="danger-button"
              disabled={Boolean(working)}
              onClick={() => void perform('clear')}
            >
              确认清除
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
