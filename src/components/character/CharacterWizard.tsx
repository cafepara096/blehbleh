/**
 * Creador de personaje estilo D&D Beyond / PHB 2024
 * Orden: Clase → Trasfondo → Especie → Atributos → Habilidades → Equipo → Detalles → Resumen
 */
import { useState, useMemo } from 'react';
import type { AbilityScore, AbilityScores, Character, InventoryItem } from '../../types/dnd';
import { ABILITY_LABELS, SKILLS } from '../../types/dnd';
import { useRaces } from '../../hooks/useRaces';
import { useClasses } from '../../hooks/useClasses';
import { useBackgrounds } from '../../hooks/useBackgrounds';
import { useSpells } from '../../hooks/useSpells';
import {
  STANDARD_ARRAY,
  POINT_BUY_COST,
  pointBuyTotal,
  applyRaceASI,
  buildCharacterFromWizard,
  SUBCLASSES,
  countExtraLanguageChoices,
  COMMON_LANGUAGES,
  CLASS_SKILL_OPTIONS,
} from '../../utils/characterBuilder';
import { ALIGNMENTS, getAlignmentInfo } from '../../utils/alignments';
import { expandStartingOption, packSummary } from '../../utils/equipmentPacks';
import { computeArmorClass } from '../../utils/armorClass';
import { applyFeatureSpellGrants } from '../../utils/featureSpellGrants';
import startingEquipment from '../../data/starting-equipment.json';
import { getModifier, formatModifier } from '../../utils/character';
import { formatSpeed } from '../../utils/units';
import { ChevronRight, ChevronLeft, Check, Search } from 'lucide-react';

const ABILITIES: AbilityScore[] = ['str', 'dex', 'con', 'int', 'wis', 'cha'];

interface Props {
  onComplete: (character: Character) => void;
  onCancel: () => void;
}

type Step =
  | 'class'
  | 'background'
  | 'species'
  | 'abilities'
  | 'skills'
  | 'equipment'
  | 'details'
  | 'review';

const STEPS: { id: Step; label: string }[] = [
  { id: 'class', label: 'Clase' },
  { id: 'background', label: 'Trasfondo' },
  { id: 'species', label: 'Especie' },
  { id: 'abilities', label: 'Atributos' },
  { id: 'skills', label: 'Habilidades' },
  { id: 'equipment', label: 'Equipo' },
  { id: 'details', label: 'Detalles' },
  { id: 'review', label: 'Resumen' },
];

export function CharacterWizard({ onComplete, onCancel }: Props) {
  const { races } = useRaces();
  const { classes } = useClasses();
  const { backgrounds } = useBackgrounds();
  const { spells: spellCatalog } = useSpells();

  const [step, setStep] = useState<Step>('class');
  const [search, setSearch] = useState('');

  const [classId, setClassId] = useState('');
  const [subclassId, setSubclassId] = useState('');
  const [backgroundId, setBackgroundId] = useState('');
  const [raceId, setRaceId] = useState('');

  const [abilityMethod, setAbilityMethod] = useState<'pointbuy' | 'array' | 'manual'>('pointbuy');
  const [baseScores, setBaseScores] = useState<AbilityScores>({
    str: 8, dex: 8, con: 8, int: 8, wis: 8, cha: 8,
  });
  const [arrayAssign, setArrayAssign] = useState<Partial<Record<AbilityScore, number>>>({});

  const [chosenSkills, setChosenSkills] = useState<string[]>([]);
  const [chosenLanguages, setChosenLanguages] = useState<string[]>([]);

  const [equipMode, setEquipMode] = useState<'pack' | 'gold'>('pack');
  const [equipChoices, setEquipChoices] = useState<Record<string, number>>({});

  const [name, setName] = useState('');
  const [playerName, setPlayerName] = useState('');
  const [alignment, setAlignment] = useState('');

  const selectedClass = classes.find((c) => c.id === classId);
  const subclassOptions = useMemo(() => {
    if (!selectedClass) return [];
    if (selectedClass.subclasses?.length) return selectedClass.subclasses;
    return SUBCLASSES[selectedClass.id] || [];
  }, [selectedClass]);
  const selectedSubclass = subclassOptions.find((s) => s.id === subclassId);
  const selectedBg = backgrounds.find((b) => b.id === backgroundId);
  const selectedRace = races.find((r) => r.id === raceId);

  const scoresWithRace = useMemo(() => {
    if (!selectedRace) return baseScores;
    return applyRaceASI(baseScores, selectedRace.abilityScoreIncrease);
  }, [baseScores, selectedRace]);

  const pbSpent = pointBuyTotal(baseScores);
  const skillOpts = classId ? CLASS_SKILL_OPTIONS[classId] : undefined;
  const extraLangs = selectedRace
    ? countExtraLanguageChoices(selectedRace, selectedBg?.languages)
    : selectedBg?.languages?.count || 0;

  const stepIndex = STEPS.findIndex((s) => s.id === step);

  const canNext = (): boolean => {
    switch (step) {
      case 'class': return !!classId;
      case 'background': return !!backgroundId;
      case 'species': return !!raceId;
      case 'abilities':
        if (abilityMethod === 'pointbuy') return pbSpent === 27;
        if (abilityMethod === 'array') return ABILITIES.every((a) => arrayAssign[a] != null);
        return ABILITIES.every((a) => baseScores[a] >= 3 && baseScores[a] <= 18);
      case 'skills':
        if (!skillOpts) return true;
        return chosenSkills.length === skillOpts.count;
      case 'details': return name.trim().length > 0;
      default: return true;
    }
  };

  const goNext = () => {
    if (!canNext()) return;
    if (step === 'review') { finish(); return; }
    const next = STEPS[stepIndex + 1];
    if (next) { setSearch(''); setStep(next.id); }
  };

  const goBack = () => {
    const prev = STEPS[stepIndex - 1];
    if (prev) { setSearch(''); setStep(prev.id); }
    else onCancel();
  };

  const setScore = (ab: AbilityScore, value: number) => {
    setBaseScores((prev) => ({ ...prev, [ab]: Math.max(3, Math.min(18, value)) }));
  };

  const assignArray = (ab: AbilityScore, val: number | null) => {
    setArrayAssign((prev) => {
      const next = { ...prev };
      if (val == null) delete next[ab];
      else {
        for (const k of Object.keys(next) as AbilityScore[]) {
          if (next[k] === val && k !== ab) delete next[k];
        }
        next[ab] = val;
      }
      const scores: AbilityScores = { str: 8, dex: 8, con: 8, int: 8, wis: 8, cha: 8 };
      for (const a of ABILITIES) {
        if (next[a] != null) scores[a] = next[a]!;
      }
      setBaseScores(scores);
      return next;
    });
  };

  const toggleSkill = (skill: string) => {
    if (!skillOpts) return;
    setChosenSkills((prev) => {
      if (prev.includes(skill)) return prev.filter((s) => s !== skill);
      if (prev.length >= skillOpts.count) return prev;
      return [...prev, skill];
    });
  };

  const buildInventory = (): InventoryItem[] | undefined => {
    if (equipMode === 'gold' || !classId) return undefined;
    const pack = (startingEquipment as Record<string, { fixed: Omit<InventoryItem, 'id'>[]; options?: { label: string; choices: string[] }[] }>)[classId];
    if (!pack) return undefined;
    const items: InventoryItem[] = pack.fixed.map((it) => ({
      ...it,
      id: crypto.randomUUID(),
      quantity: it.quantity || 1,
    }));
    for (const [key, idx] of Object.entries(equipChoices)) {
      const opt = pack.options?.[Number(key)];
      if (!opt) continue;
      const choice = opt.choices[idx];
      if (!choice) continue;
      try {
        const expanded = expandStartingOption({ name: choice });
        for (const it of expanded) {
          items.push({ ...it, id: crypto.randomUUID() });
        }
      } catch {
        items.push({ id: crypto.randomUUID(), name: choice, quantity: 1 });
      }
    }
    return items;
  };

  const finish = () => {
    if (!selectedClass || !selectedRace || !selectedBg) return;
    let scores = { ...baseScores };
    if (abilityMethod === 'array') {
      scores = { str: 8, dex: 8, con: 8, int: 8, wis: 8, cha: 8 };
      for (const a of ABILITIES) {
        if (arrayAssign[a] != null) scores[a] = arrayAssign[a]!;
      }
    }
    let character = buildCharacterFromWizard({
      name: name.trim(),
      race: selectedRace,
      classData: selectedClass,
      subclassName: selectedSubclass?.name,
      subclassId: selectedSubclass?.id,
      background: selectedBg.name,
      baseScores: scores,
      level: 1,
      chosenLanguages,
      chosenSkills,
      customInventory: buildInventory(),
    });
    if (playerName.trim()) {
      (character as Character & { playerName?: string }).playerName = playerName.trim();
    }
    if (alignment) character = { ...character, alignment };
    if (equipMode === 'gold') {
      const goldByClass: Record<string, number> = {
        barbarian: 75, bard: 100, cleric: 100, druid: 50, fighter: 100,
        monk: 50, paladin: 100, ranger: 100, rogue: 100, sorcerer: 75,
        warlock: 100, wizard: 100,
      };
      character = {
        ...character,
        inventory: [],
        notes: [character.notes || '', `Oro inicial: ${goldByClass[classId] || 100} po`].filter(Boolean).join('\n'),
      };
    }
    character = applyFeatureSpellGrants(character, spellCatalog);
    character = { ...character, armorClass: computeArmorClass(character) };
    onComplete(character);
  };

  const filterList = <T extends { name: string }>(list: T[]) => {
    const q = search.trim().toLowerCase();
    if (!q) return list;
    return list.filter((x) => x.name.toLowerCase().includes(q));
  };

  const previewScores = scoresWithRace;

  return (
    <div className="min-h-[70vh] flex flex-col lg:flex-row gap-4">
      <div className="flex-1 min-w-0 space-y-4">
        <div className="flex flex-wrap gap-1">
          {STEPS.map((s, i) => (
            <button
              key={s.id}
              type="button"
              onClick={() => i <= stepIndex && setStep(s.id)}
              className={`text-[11px] sm:text-xs px-2 py-1 rounded-full border font-medium ${
                s.id === step
                  ? 'bg-crimson-700 text-white border-crimson-800'
                  : i < stepIndex
                  ? 'bg-green-100 border-green-400 text-green-900'
                  : 'bg-parchment-100 border-ink-300 text-ink-500'
              }`}
            >
              {i < stepIndex ? <Check className="w-3 h-3 inline mr-0.5" /> : null}
              {s.label}
            </button>
          ))}
        </div>

        <div className="bg-parchment-50 border-2 border-ink-800 rounded-xl p-4 shadow-sm min-h-[320px]">
          {step === 'class' && (
            <div className="space-y-3">
              <h2 className="font-display font-bold text-xl">Elige clase</h2>
              <p className="text-xs text-ink-600">Oficiales + homebrew. Subclase opcional (suele ser nivel 3).</p>
              <div className="relative">
                <Search className="w-4 h-4 absolute left-2 top-2.5 text-ink-400" />
                <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar clase…" className="w-full pl-8 pr-3 py-2 border-2 border-ink-300 rounded-lg" />
              </div>
              <div className="grid sm:grid-cols-2 gap-2 max-h-64 overflow-y-auto">
                {filterList(classes).map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => { setClassId(c.id); setSubclassId(''); setChosenSkills([]); setEquipChoices({}); }}
                    className={`text-left p-3 rounded-lg border-2 ${classId === c.id ? 'border-crimson-600 bg-crimson-50' : 'border-ink-200 bg-white hover:border-ink-400'}`}
                  >
                    <div className="font-bold flex items-center gap-2">
                      {c.name}
                      {c.homebrew && <span className="text-[9px] bg-violet-200 text-violet-900 px-1 rounded">HB</span>}
                    </div>
                    <p className="text-[11px] text-ink-600 line-clamp-2 mt-0.5">{c.description}</p>
                    <p className="text-[10px] text-ink-500 mt-1">PG {c.hitDie} · {c.primaryAbility}</p>
                  </button>
                ))}
              </div>
              {selectedClass && subclassOptions.length > 0 && (
                <div className="border-t border-ink-200 pt-3">
                  <h3 className="font-bold text-sm mb-1">Subclase (opcional)</h3>
                  <div className="grid sm:grid-cols-2 gap-1.5 max-h-40 overflow-y-auto">
                    {subclassOptions.map((s) => (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => setSubclassId(subclassId === s.id ? '' : s.id)}
                        className={`text-left p-2 rounded border text-xs ${subclassId === s.id ? 'border-purple-600 bg-purple-50' : 'border-ink-200 bg-white'}`}
                      >
                        <strong>{s.name}</strong>
                        <span className="block text-ink-600 line-clamp-2">{s.description}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {step === 'background' && (
            <div className="space-y-3">
              <h2 className="font-display font-bold text-xl">Trasfondo</h2>
              <div className="relative">
                <Search className="w-4 h-4 absolute left-2 top-2.5 text-ink-400" />
                <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar…" className="w-full pl-8 pr-3 py-2 border-2 border-ink-300 rounded-lg" />
              </div>
              <div className="space-y-2 max-h-80 overflow-y-auto">
                {filterList(backgrounds).map((b) => (
                  <button
                    key={b.id}
                    type="button"
                    onClick={() => setBackgroundId(b.id)}
                    className={`w-full text-left p-3 rounded-lg border-2 ${backgroundId === b.id ? 'border-crimson-600 bg-crimson-50' : 'border-ink-200 bg-white'}`}
                  >
                    <div className="font-bold flex gap-2 items-center">
                      {b.name}
                      {b.homebrew && <span className="text-[9px] bg-violet-200 text-violet-900 px-1 rounded">HB</span>}
                    </div>
                    {b.description && <p className="text-[11px] text-ink-600 mt-0.5 line-clamp-2">{b.description}</p>}
                  </button>
                ))}
              </div>
            </div>
          )}

          {step === 'species' && (
            <div className="space-y-3">
              <h2 className="font-display font-bold text-xl">Especie</h2>
              <div className="relative">
                <Search className="w-4 h-4 absolute left-2 top-2.5 text-ink-400" />
                <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar…" className="w-full pl-8 pr-3 py-2 border-2 border-ink-300 rounded-lg" />
              </div>
              <div className="grid sm:grid-cols-2 gap-2 max-h-80 overflow-y-auto">
                {filterList(races).map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => setRaceId(r.id)}
                    className={`text-left p-3 rounded-lg border-2 ${raceId === r.id ? 'border-crimson-600 bg-crimson-50' : 'border-ink-200 bg-white'}`}
                  >
                    <div className="font-bold flex gap-2">
                      {r.name}
                      {r.homebrew && <span className="text-[9px] bg-violet-200 text-violet-900 px-1 rounded">HB</span>}
                    </div>
                    <p className="text-[11px] text-ink-600 line-clamp-2">{r.description}</p>
                    <p className="text-[10px] text-ink-500 mt-1">{formatSpeed(r.speed)} · {r.size}</p>
                  </button>
                ))}
              </div>
            </div>
          )}

          {step === 'abilities' && (
            <div className="space-y-3">
              <h2 className="font-display font-bold text-xl">Puntuaciones de característica</h2>
              <div className="flex flex-wrap gap-2">
                {([['pointbuy', 'Compra (27)'], ['array', 'Array'], ['manual', 'Manual']] as const).map(([id, label]) => (
                  <button key={id} type="button" onClick={() => setAbilityMethod(id)}
                    className={`px-3 py-1.5 rounded-lg text-sm border-2 ${abilityMethod === id ? 'bg-crimson-700 text-white border-crimson-800' : 'bg-white border-ink-300'}`}>
                    {label}
                  </button>
                ))}
              </div>
              {abilityMethod === 'pointbuy' && (
                <p className="text-xs">Puntos: <strong className={pbSpent === 27 ? 'text-green-700' : 'text-amber-700'}>{pbSpent}/27</strong></p>
              )}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {ABILITIES.map((ab) => (
                  <div key={ab} className="bg-white border-2 border-ink-300 rounded-lg p-2">
                    <div className="text-xs font-bold uppercase text-ink-600">{ABILITY_LABELS[ab]}</div>
                    {abilityMethod === 'array' ? (
                      <select className="w-full mt-1 border rounded px-1 py-1 text-sm font-bold" value={arrayAssign[ab] ?? ''}
                        onChange={(e) => assignArray(ab, e.target.value ? Number(e.target.value) : null)}>
                        <option value="">—</option>
                        {STANDARD_ARRAY.map((v) => (
                          <option key={v} value={v} disabled={Object.entries(arrayAssign).some(([k, val]) => k !== ab && val === v)}>{v}</option>
                        ))}
                      </select>
                    ) : (
                      <div className="flex items-center gap-1 mt-1">
                        <button type="button" className="px-2 border rounded" onClick={() => setScore(ab, baseScores[ab] - 1)}>−</button>
                        <span className="flex-1 text-center font-bold text-lg">{baseScores[ab]}</span>
                        <button type="button" className="px-2 border rounded" onClick={() => setScore(ab, baseScores[ab] + 1)}>+</button>
                      </div>
                    )}
                    <div className="text-center text-xs text-ink-500 mt-0.5">
                      {formatModifier(getModifier(previewScores[ab]))}
                      {selectedRace && previewScores[ab] !== baseScores[ab] && <span className="text-green-700"> → {previewScores[ab]}</span>}
                    </div>
                    {abilityMethod === 'pointbuy' && (
                      <div className="text-[10px] text-center text-ink-400">coste {POINT_BUY_COST[baseScores[ab]] ?? '—'}</div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {step === 'skills' && (
            <div className="space-y-3">
              <h2 className="font-display font-bold text-xl">Habilidades e idiomas</h2>
              {skillOpts ? (
                <>
                  <p className="text-xs text-ink-600">Elige <strong>{skillOpts.count}</strong> de la lista de clase. La competencia suma el bonificador de competencia.</p>
                  <div className="grid sm:grid-cols-2 gap-1.5 max-h-56 overflow-y-auto">
                    {skillOpts.skills.map((sk) => {
                      const meta = SKILLS.find((s) => s.name.toLowerCase() === sk.toLowerCase() || s.id === sk.toLowerCase());
                      const selected = chosenSkills.includes(sk);
                      return (
                        <label key={sk} className={`flex gap-2 items-start p-2 rounded border cursor-pointer text-xs ${selected ? 'bg-crimson-50 border-crimson-400' : 'bg-white border-ink-200'}`}>
                          <input type="checkbox" checked={selected} onChange={() => toggleSkill(sk)} className="mt-0.5" />
                          <span>
                            <strong>{sk}</strong>
                            {meta && <span className="text-ink-500"> ({ABILITY_LABELS[meta.ability]})</span>}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                  <p className="text-[11px] font-mono">Elegidas: {chosenSkills.length}/{skillOpts.count}</p>
                </>
              ) : (
                <p className="text-sm text-ink-500">Elige una clase primero.</p>
              )}
              {extraLangs > 0 && (
                <div className="border-t pt-3">
                  <h3 className="font-bold text-sm mb-1">Idiomas adicionales ({chosenLanguages.length}/{extraLangs})</h3>
                  <div className="flex flex-wrap gap-1">
                    {COMMON_LANGUAGES.map((lang) => {
                      const on = chosenLanguages.includes(lang);
                      return (
                        <button key={lang} type="button"
                          onClick={() => setChosenLanguages((prev) => {
                            if (on) return prev.filter((l) => l !== lang);
                            if (prev.length >= extraLangs) return prev;
                            return [...prev, lang];
                          })}
                          className={`text-[10px] px-2 py-1 rounded border ${on ? 'bg-ink-800 text-white' : 'bg-white'}`}>
                          {lang}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {step === 'equipment' && (
            <div className="space-y-3">
              <h2 className="font-display font-bold text-xl">Equipo inicial</h2>
              <div className="flex gap-2">
                <button type="button" onClick={() => setEquipMode('pack')} className={`px-3 py-1.5 rounded-lg text-sm border-2 ${equipMode === 'pack' ? 'bg-crimson-700 text-white border-crimson-800' : 'bg-white border-ink-300'}`}>Paquete</button>
                <button type="button" onClick={() => setEquipMode('gold')} className={`px-3 py-1.5 rounded-lg text-sm border-2 ${equipMode === 'gold' ? 'bg-crimson-700 text-white border-crimson-800' : 'bg-white border-ink-300'}`}>Oro</button>
              </div>
              {equipMode === 'gold' ? (
                <p className="text-sm text-ink-600">Empiezas con oro según clase (sin paquete).</p>
              ) : classId && (startingEquipment as Record<string, unknown>)[classId] ? (
                (() => {
                  const pack = (startingEquipment as Record<string, { fixed: { name: string; quantity?: number }[]; options?: { label: string; choices: string[] }[] }>)[classId];
                  return (
                    <div className="space-y-3 text-sm">
                      <div>
                        <h3 className="font-bold text-xs uppercase text-ink-500 mb-1">Equipo fijo</h3>
                        <ul className="space-y-0.5">
                          {pack.fixed.map((it, i) => (
                            <li key={i} className="text-xs">
                              • {it.name}{it.quantity && it.quantity > 1 ? ` ×${it.quantity}` : ''}
                              {packSummary(it.name) && <span className="block text-[10px] text-ink-500 ml-3">Incluye: {packSummary(it.name)}</span>}
                            </li>
                          ))}
                        </ul>
                      </div>
                      {pack.options?.map((opt, oi) => (
                        <div key={oi} className="border border-ink-200 rounded-lg p-2 bg-white">
                          <p className="font-bold text-xs mb-1">{opt.label || `Opción ${oi + 1}`}</p>
                          <div className="space-y-1">
                            {opt.choices.map((ch, ci) => (
                              <label key={ci} className="flex gap-2 items-start text-xs cursor-pointer">
                                <input type="radio" name={`eq-${oi}`} checked={equipChoices[String(oi)] === ci}
                                  onChange={() => setEquipChoices((prev) => ({ ...prev, [String(oi)]: ci }))} className="mt-0.5" />
                                <span>
                                  {ch}
                                  {packSummary(ch) && <span className="block text-[10px] text-ink-500">Incluye: {packSummary(ch)}</span>}
                                </span>
                              </label>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  );
                })()
              ) : (
                <p className="text-sm text-ink-500">Sin datos de equipo para esta clase.</p>
              )}
            </div>
          )}

          {step === 'details' && (
            <div className="space-y-3">
              <h2 className="font-display font-bold text-xl">Detalles</h2>
              <div>
                <label className="block text-xs font-bold mb-1">Nombre del personaje *</label>
                <input value={name} onChange={(e) => setName(e.target.value)} className="w-full px-3 py-2 border-2 border-ink-300 rounded-lg" placeholder="Nombre" />
              </div>
              <div>
                <label className="block text-xs font-bold mb-1">Jugador</label>
                <input value={playerName} onChange={(e) => setPlayerName(e.target.value)} className="w-full px-3 py-2 border-2 border-ink-300 rounded-lg" />
              </div>
              <div>
                <label className="block text-xs font-bold mb-1">Alineamiento</label>
                <select value={alignment} onChange={(e) => setAlignment(e.target.value)} className="w-full px-3 py-2 border-2 border-ink-300 rounded-lg">
                  <option value="">— Elegir —</option>
                  {ALIGNMENTS.map((a) => <option key={a.id} value={a.name}>{a.name}</option>)}
                </select>
                {getAlignmentInfo(alignment) && (
                  <p className="text-xs text-ink-600 mt-1.5 bg-parchment-100 border border-ink-200 rounded px-2 py-1.5">{getAlignmentInfo(alignment)!.description}</p>
                )}
              </div>
            </div>
          )}

          {step === 'review' && (
            <div className="space-y-3">
              <h2 className="font-display font-bold text-xl">Resumen</h2>
              <dl className="grid grid-cols-2 gap-2 text-sm">
                <div><dt className="text-[10px] uppercase text-ink-500">Nombre</dt><dd className="font-bold">{name || '—'}</dd></div>
                <div><dt className="text-[10px] uppercase text-ink-500">Clase</dt><dd className="font-bold">{selectedClass?.name}{selectedSubclass ? ` · ${selectedSubclass.name}` : ''}</dd></div>
                <div><dt className="text-[10px] uppercase text-ink-500">Especie</dt><dd>{selectedRace?.name}</dd></div>
                <div><dt className="text-[10px] uppercase text-ink-500">Trasfondo</dt><dd>{selectedBg?.name}</dd></div>
              </dl>
              <div className="flex flex-wrap gap-2">
                {ABILITIES.map((ab) => (
                  <div key={ab} className="bg-white border rounded px-2 py-1 text-center min-w-[3.5rem]">
                    <div className="text-[9px] uppercase font-bold text-ink-500">{ABILITY_LABELS[ab]}</div>
                    <div className="font-bold">{previewScores[ab]}</div>
                    <div className="text-[10px]">{formatModifier(getModifier(previewScores[ab]))}</div>
                  </div>
                ))}
              </div>
              {chosenSkills.length > 0 && <p className="text-xs"><strong>Habilidades:</strong> {chosenSkills.join(', ')}</p>}
            </div>
          )}
        </div>

        <div className="flex gap-2">
          <button type="button" onClick={goBack} className="flex items-center gap-1 px-4 py-2.5 border-2 border-ink-400 rounded-lg font-bold">
            <ChevronLeft className="w-4 h-4" />
            {stepIndex === 0 ? 'Cancelar' : 'Atrás'}
          </button>
          <button type="button" onClick={goNext} disabled={!canNext()}
            className="flex-1 flex items-center justify-center gap-1 px-4 py-2.5 bg-crimson-700 text-white rounded-lg font-bold disabled:opacity-40">
            {step === 'review' ? 'Crear personaje' : 'Siguiente'}
            {step !== 'review' && <ChevronRight className="w-4 h-4" />}
          </button>
        </div>
      </div>

      <aside className="lg:w-64 shrink-0">
        <div className="sticky top-2 bg-ink-900 text-parchment-50 rounded-xl p-4 border-2 border-ink-950 shadow-lg">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-12 h-12 rounded-full bg-crimson-700 flex items-center justify-center text-xl font-bold">
              {(name || '?').charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0">
              <div className="font-bold truncate">{name || 'Sin nombre'}</div>
              <div className="text-[11px] text-parchment-300 truncate">
                {[selectedRace?.name, selectedClass?.name, selectedSubclass?.name].filter(Boolean).join(' · ') || '—'}
              </div>
            </div>
          </div>
          {selectedBg && <p className="text-[11px] text-parchment-400 mb-2">Trasfondo: {selectedBg.name}</p>}
          <div className="grid grid-cols-3 gap-1">
            {ABILITIES.map((ab) => (
              <div key={ab} className="bg-ink-800 rounded p-1 text-center">
                <div className="text-[8px] uppercase text-parchment-400">{ABILITY_LABELS[ab]}</div>
                <div className="font-bold text-sm">{previewScores[ab]}</div>
              </div>
            ))}
          </div>
        </div>
      </aside>
    </div>
  );
}
