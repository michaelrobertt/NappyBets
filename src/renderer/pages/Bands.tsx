import { useMemo } from 'react';
import { AlertTriangle, Gauge, Info, Target } from 'lucide-react';
import { useApp } from '../state/app';
import { fmtBrier, fmtNumber, fmtPercent, fmtSigned } from '../lib/format';
import { CalibrationChart } from '../components/charts';
import { EmptyState, KpiCard } from '../components/ui';

export function BandsPage() {
  const { analytics, settings } = useApp();

  const bands = analytics?.calibration.bands ?? [];
  const withData = bands.filter((band) => band.count > 0);
  const lowSample = withData.filter((band) => band.count < settings.minSample).length;

  const worst = useMemo(() => {
    if (!withData.length) return null;
    return withData.reduce((acc, band) => {
      const gap = Math.abs((band.hitRate ?? 0) - band.expected);
      const accGap = Math.abs((acc.hitRate ?? 0) - acc.expected);
      return gap > accGap ? band : acc;
    }, withData[0]!);
  }, [withData]);

  const summary = analytics?.summary;

  return (
    <div className="stack">
      <div className="card">
        <div className="row wrap" style={{ gap: 10, justifyContent: 'space-between' }}>
          <div style={{ maxWidth: 760 }}>
            <div className="card-title">
              <Gauge size={15} /> Calibração das previsões
            </div>
            <p className="hint" style={{ marginTop: 6 }}>
              Uma previsão bem calibrada acerta aproximadamente na frequência que estimou. Se as previsões de 70%
              acertam perto de 70% das vezes, a calibração está consistente. Pontos acima da linha tracejada indicam
              subestimação da confiança; abaixo, excesso de confiança.
            </p>
          </div>
          <div className="badge badge-neutral">
            <Target size={12} /> {fmtNumber(analytics?.calibration.settled ?? 0)} previsões concluídas
          </div>
        </div>
      </div>

      <div className="kpi-grid" style={{ gridTemplateColumns: 'repeat(4, minmax(0, 1fr))' }}>
        <KpiCard label="Probabilidade média" value={fmtPercent(summary?.avgProbability ?? null)} sub="Média das estimativas registradas" accent />
        <KpiCard label="Acerto real" value={fmtPercent(summary?.hitRate ?? null)} sub="Considera apenas acertos e erros" />
        <KpiCard
          label="Desvio de calibração"
          value={fmtSigned(summary?.calibrationGap ?? null)}
          sub="Acerto real − probabilidade média"
          icon={<Gauge size={15} />}
        />
        <KpiCard label="Brier Score médio" value={fmtBrier(summary?.brier ?? null)} sub="0 é perfeito · 0,25 = moeda justa" />
      </div>

      <div className="grid" style={{ gridTemplateColumns: '1fr 1.25fr', alignItems: 'start' }}>
        <div className="card">
          <div className="card-head">
            <div>
              <div className="card-title">Estimado × observado</div>
              <div className="card-desc">Tamanho do ponto = volume de previsões na faixa</div>
            </div>
          </div>
          <CalibrationChart bands={bands} height={300} />
          <div className="pill-row" style={{ marginTop: 10 }}>
            <span className="row small muted-3" style={{ gap: 5 }}>
              <span className="dot" style={{ background: 'var(--accent)' }} /> calibrado
            </span>
            <span className="row small muted-3" style={{ gap: 5 }}>
              <span className="dot" style={{ background: 'var(--warn)' }} /> desvio moderado
            </span>
            <span className="row small muted-3" style={{ gap: 5 }}>
              <span className="dot" style={{ background: 'var(--danger)' }} /> desvio alto
            </span>
          </div>
        </div>

        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: 14 }}>
            <div className="card-title">Tabela de faixas</div>
            <div className="card-desc">
              {lowSample > 0
                ? `${lowSample} faixa(s) com menos de ${settings.minSample} resultados — leitura apenas indicativa.`
                : 'Todas as faixas com dados atingem a amostra mínima configurada.'}
            </div>
          </div>
          {withData.length === 0 ? (
            <EmptyState
              icon={<Info size={20} />}
              title="Sem previsões concluídas"
              message="Atualize o status das previsões para acertou ou errou para visualizar a calibração."
            />
          ) : (
            <div className="table-wrap" style={{ border: 'none', borderRadius: 0 }}>
              <table className="table">
                <thead>
                  <tr>
                    <th>Faixa</th>
                    <th className="num">Previsões</th>
                    <th className="num">Estimado</th>
                    <th className="num">Acerto real</th>
                    <th className="num">Desvio</th>
                    <th>Amostra</th>
                  </tr>
                </thead>
                <tbody>
                  {bands.map((band) => {
                    const gap = band.hitRate !== null ? band.hitRate - band.expected : null;
                    const low = band.count > 0 && band.count < settings.minSample;
                    return (
                      <tr key={band.label} style={band.count === 0 ? { opacity: 0.45 } : undefined}>
                        <td className="cell-title nowrap">{band.label}</td>
                        <td className="num">{fmtNumber(band.count)}</td>
                        <td className="num muted">{band.count ? fmtPercent(band.expected) : '—'}</td>
                        <td className="num">
                          {band.count ? (
                            <strong className={gap !== null && Math.abs(gap) > 10 ? 'neg' : ''}>
                              {fmtPercent(band.hitRate)}
                            </strong>
                          ) : (
                            '—'
                          )}
                        </td>
                        <td className={`num ${gap === null ? 'muted' : gap >= 0 ? 'pos' : 'neg'}`}>
                          {gap === null ? '—' : fmtSigned(gap)}
                        </td>
                        <td>
                          {band.count === 0 ? (
                            <span className="tag">sem dados</span>
                          ) : low ? (
                            <span className="badge badge-pending">
                              <AlertTriangle size={10} /> baixa
                            </span>
                          ) : (
                            <span className="badge badge-hit">suficiente</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      <div className="grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
        <div className="card">
          <div className="card-title" style={{ marginBottom: 8 }}>
            Como o Brier Score é calculado
          </div>
          <div className="small muted" style={{ lineHeight: 1.65 }}>
            <p>
              Para cada previsão concluída: <code>Brier = (probabilidade_estimada − resultado)²</code>, com
              probabilidade entre 0 e 1, resultado 1 para acerto e 0 para erro. O indicador exibido é a média
              aritmética desses valores.
            </p>
            <p style={{ marginTop: 8 }}>
              Um modelo que sempre estima 50% obtém 0,25. Previsões confiantes e corretas reduzem o score; confiantes
              e erradas o aumentam rapidamente. Pendentes e anuladas são ignoradas.
            </p>
            {worst ? (
              <p style={{ marginTop: 8 }}>
                Maior desvio atual: faixa <strong>{worst.label}</strong>, com {fmtNumber(worst.count)} previsão(ões),
                estimativa média de {fmtPercent(worst.expected)} e acerto observado de {fmtPercent(worst.hitRate)}.
              </p>
            ) : null}
          </div>
        </div>

        <div className="card">
          <div className="card-title" style={{ marginBottom: 8 }}>
            Limites de interpretação
          </div>
          <ul className="hint" style={{ margin: 0, paddingLeft: 16, display: 'grid', gap: 7 }}>
            <li>Com menos de {settings.minSample} resultados por faixa, o percentual pode oscilar muito.</li>
            <li>Faixas altas costumam ter poucas observações; desvios grandes ali não invalidam todo o histórico.</li>
            <li>Compare faixas com amostras semelhantes antes de concluir que existe excesso de confiança.</li>
            <li>O Brier mistura calibração e resolução: consulte sempre os dois indicadores juntos.</li>
            <li>Os cálculos usam apenas previsões marcadas como acertou ou errou.</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
