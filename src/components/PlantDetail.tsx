import { useState, type ReactNode } from 'react';
import {
  Check,
  ChevronRight,
  ImagePlus,
  LoaderCircle,
  MapPin,
  Pencil,
  Sparkles,
} from 'lucide-react';
import type { Entry, Photo, Plant } from '../types';
import { WateringCard } from './WateringCard';
import { dateLabel, Empty, healthLabels, moistureLabels } from './ui';

export function PlantDetail({
  plant,
  photos,
  entries,
  busy,
  analyzing,
  failed,
  onPhoto,
  onLightbox,
  onWater,
  onPlan,
  onCheck,
  onNote,
  onAnalyze,
  onAIPlan,
  onTasks,
  renderEntry,
}: {
  plant: Plant;
  photos: Photo[];
  entries: Entry[];
  busy: boolean;
  analyzing: boolean;
  failed: boolean;
  onPhoto: () => void;
  onLightbox: (image: string) => void;
  onWater: () => void;
  onPlan: () => void;
  onCheck: () => void;
  onNote: () => void;
  onAnalyze: () => void;
  onAIPlan: () => void;
  onTasks: () => void;
  renderEntry: (entry: Entry) => ReactNode;
}) {
  const [tab, setTab] = useState<'care' | 'photos' | 'history'>('care');
  const analysis = plant.analysis;
  return (
    <div className="plant-detail">
      <div className="plant-profile">
        <button
          className="plant-profile-cover"
          aria-label="查看植物大图"
          onClick={() => onLightbox(plant.cover)}
        >
          <img src={plant.cover} alt={plant.name} decoding="async" />
        </button>
        <div>
          <h1>{plant.name}</h1>
          <p className="plant-profile-meta">
            <MapPin size={14} />
            {plant.location}
            <span>· {plant.species}</span>
          </p>
          <span className={`status-pill ${plant.health}`}>
            <i />
            {healthLabels[plant.health]}
          </span>
          {plant.demo && <small className="plant-profile-demo">示例植物</small>}
        </div>
      </div>
      <div className="detail-tabs" role="tablist" aria-label="植物档案内容">
        {(
          [
            { id: 'care', label: '养护' },
            { id: 'photos', label: '相册' },
            { id: 'history', label: '记录' },
          ] as const
        ).map((item) => (
          <button
            key={item.id}
            id={`plant-tab-${item.id}`}
            role="tab"
            aria-selected={tab === item.id}
            aria-controls={`plant-panel-${item.id}`}
            onClick={() => setTab(item.id)}
          >
            {item.label}
          </button>
        ))}
        <span
          className="detail-tab-indicator"
          aria-hidden="true"
          style={{ transform: `translateX(${['care', 'photos', 'history'].indexOf(tab) * 100}%)` }}
        />
      </div>
      <section
        id={`plant-panel-${tab}`}
        role="tabpanel"
        aria-labelledby={`plant-tab-${tab}`}
        className="detail-panel"
        key={tab}
      >
        {tab === 'care' && (
          <>
            <WateringCard plant={plant} busy={busy} onWater={onWater} onPlan={onPlan} />
            <button className="secondary-button full detail-check" onClick={onCheck}>
              <Check size={17} />
              记录盆土检查<span>{moistureLabels[plant.moisture]}</span>
            </button>
            <section className="detail-ai">
              <div className="detail-section-heading">
                <h2>
                  <Sparkles size={19} />
                  AI 观察
                </h2>
                <button className="text-button" disabled={busy || analyzing} onClick={onAnalyze}>
                  {analyzing ? (
                    <>
                      <LoaderCircle className="spin" size={15} />
                      分析中
                    </>
                  ) : (
                    <>
                      {analysis ? '重新分析' : '开始分析'}
                      <ChevronRight size={15} />
                    </>
                  )}
                </button>
              </div>
              <p>
                {analysis?.summary || '添加植物和盆土照片，让 AI 帮你观察状态。分析可在后台进行。'}
              </p>
              {analysis && (
                <details className="detail-disclosure">
                  <summary>
                    观察详情与养护建议
                    <ChevronRight size={16} />
                  </summary>
                  <div className="detail-ai-expanded">
                    <p className="detail-soil">
                      土表观察：{moistureLabels[analysis.soil.surface]}。{analysis.soil.note}
                    </p>
                    {!!analysis.observations.length && (
                      <ul>
                        {analysis.observations.map((item) => (
                          <li key={item}>{item}</li>
                        ))}
                      </ul>
                    )}
                    {analysis.warnings.map((warning) => (
                      <p className="analysis-warning" key={warning}>
                        {warning}
                      </p>
                    ))}
                    <dl className="detail-guide">
                      {[
                        ['浇水', analysis.watering.advice],
                        ['光照与温度', `${analysis.care.light} ${analysis.care.temperature}`],
                        ['施肥', analysis.care.fertilizer],
                        ['修剪', analysis.care.pruning],
                      ].map(([title, text]) => (
                        <div key={title}>
                          <dt>{title}</dt>
                          <dd>{text}</dd>
                        </div>
                      ))}
                    </dl>
                    <button className="secondary-button full" onClick={onAIPlan}>
                      采用盆土检查计划
                      <ChevronRight size={15} />
                    </button>
                    <small>
                      {plant.analysisAt && dateLabel(plant.analysisAt)} · 识别把握：
                      {{ high: '较高', medium: '一般', low: '较低' }[analysis.confidence]}
                      。建议结合实际情况确认。
                    </small>
                  </div>
                </details>
              )}
              {failed && (
                <button className="text-button danger" onClick={onTasks}>
                  分析未完成，查看任务
                  <ChevronRight size={15} />
                </button>
              )}
            </section>
            {!!plant.notes && (
              <details className="detail-disclosure plant-note-disclosure">
                <summary>
                  档案备注
                  <ChevronRight size={16} />
                </summary>
                <p>{plant.notes}</p>
              </details>
            )}
          </>
        )}
        {tab === 'photos' && (
          <>
            <div className="detail-section-heading">
              <h2>
                成长相册 <small>{photos.length} 张</small>
              </h2>
              <button className="text-button" onClick={onPhoto}>
                <ImagePlus size={17} />
                添加照片
              </button>
            </div>
            {photos.length ? (
              <div className="detail-photo-grid">
                {photos.map((photo) => (
                  <button
                    key={photo.id}
                    onClick={() => onLightbox(photo.dataUrl)}
                    aria-label={`查看${photo.kind === 'soil' ? '盆土' : '植物'}照片 ${dateLabel(photo.createdAt)}`}
                  >
                    <img
                      src={photo.dataUrl}
                      alt={photo.caption || plant.name}
                      loading="lazy"
                      decoding="async"
                    />
                    <span>{photo.kind === 'soil' ? '盆土' : dateLabel(photo.createdAt)}</span>
                  </button>
                ))}
              </div>
            ) : (
              <Empty title="记下它的新模样" text="拍一张照片，留下成长的变化。">
                <button className="primary-button" onClick={onPhoto}>
                  添加照片
                </button>
              </Empty>
            )}
          </>
        )}
        {tab === 'history' && (
          <>
            <div className="detail-section-heading">
              <h2>养护记录</h2>
              <button className="text-button" onClick={onNote}>
                <Pencil size={16} />
                写日记
              </button>
            </div>
            {entries.length ? (
              <div className="journal-list">{entries.slice(0, 50).map(renderEntry)}</div>
            ) : (
              <Empty title="从今天开始记录" text="浇水、检查和日记都会保存在这里。" />
            )}
          </>
        )}
      </section>
    </div>
  );
}
