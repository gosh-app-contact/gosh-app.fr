import { MuscleGroup } from '../types/training';

export type ExerciseLibraryItem = {
  slug: string;
  name: string;
  muscle: MuscleGroup;
};

export const EXERCISE_LIBRARY: ExerciseLibraryItem[] = [
  // ─── PECS ─────────────────────────────────────────────────────────────────
  { slug: 'bench_press_bar',           name: 'Développé couché barre',              muscle: 'pecs' },
  { slug: 'bench_press_smith',         name: 'Développé couché barre (Smith)',       muscle: 'pecs' },
  { slug: 'bench_press_db',            name: 'Développé couché haltères',            muscle: 'pecs' },
  { slug: 'incline_press_bar',         name: 'Développé incliné barre',              muscle: 'pecs' },
  { slug: 'incline_press_smith',       name: 'Développé incliné barre (Smith)',      muscle: 'pecs' },
  { slug: 'incline_press_db',          name: 'Développé incliné haltères',           muscle: 'pecs' },
  { slug: 'decline_press_bar',         name: 'Développé décliné barre',              muscle: 'pecs' },
  { slug: 'decline_press_smith',       name: 'Développé décliné barre (Smith)',      muscle: 'pecs' },
  { slug: 'flyes_db',                  name: 'Écarté haltères',                      muscle: 'pecs' },
  { slug: 'cable_fly_high',            name: 'Écarté poulie haute',                  muscle: 'pecs' },
  { slug: 'cable_fly_low',             name: 'Écarté poulie basse',                  muscle: 'pecs' },
  { slug: 'pec_fly_machine',           name: 'Pec fly machine',                      muscle: 'pecs' },
  { slug: 'dips_chest',                name: 'Dips pectoraux',                       muscle: 'pecs' },
  { slug: 'pullover_db',               name: 'Pull-over haltère',                    muscle: 'pecs' },
  { slug: 'chest_press_machine',        name: 'Chest press',                          muscle: 'pecs' },
  { slug: 'pushups',                   name: 'Pompes',                               muscle: 'pecs' },

  // ─── DOS ──────────────────────────────────────────────────────────────────
  { slug: 'pullups',                   name: 'Tractions',                            muscle: 'dos' },
  { slug: 'pullups_weighted',          name: 'Tractions lestées',                    muscle: 'dos' },
  { slug: 'row_bar',                   name: 'Tirage horizontal barre',              muscle: 'dos' },
  { slug: 'row_db',                    name: 'Tirage horizontal haltère',            muscle: 'dos' },
  { slug: 'row_cable_unilateral',      name: 'Tirage horizontal unilatéral poulie',  muscle: 'dos' },
  { slug: 'lat_pulldown',              name: 'Tirage poulie haute',                  muscle: 'dos' },
  { slug: 'lat_pulldown_unilateral',   name: 'Tirage poulie haute unilatéral',       muscle: 'dos' },
  { slug: 'seated_cable_row',          name: 'Tirage poulie basse',                  muscle: 'dos' },
  { slug: 'seated_cable_row_uni',      name: 'Tirage poulie basse unilatéral',       muscle: 'dos' },
  { slug: 'db_row',                    name: 'Rowing haltère',                       muscle: 'dos' },
  { slug: 'barbell_row',               name: 'Rowing barre',                         muscle: 'dos' },
  { slug: 'deadlift',                  name: 'Soulevé de terre',                     muscle: 'dos' },
  { slug: 'romanian_deadlift',         name: 'Soulevé de terre roumain',             muscle: 'dos' },
  { slug: 'shrugs_bar',                name: 'Shrugs barre',                         muscle: 'dos' },
  { slug: 'shrugs_db',                 name: 'Shrugs haltères',                      muscle: 'dos' },
  { slug: 'face_pull',                 name: 'Face pull',                            muscle: 'dos' },

  // ─── ÉPAULES ──────────────────────────────────────────────────────────────
  { slug: 'ohp_bar',                   name: 'Développé militaire barre',            muscle: 'epaules' },
  { slug: 'ohp_db',                    name: 'Développé militaire haltères',         muscle: 'epaules' },
  { slug: 'lateral_raise',             name: 'Élévations latérales',                 muscle: 'epaules' },
  { slug: 'front_raise',               name: 'Élévations frontales',                 muscle: 'epaules' },
  { slug: 'rear_delt_fly_db',          name: 'Oiseau haltères',                      muscle: 'epaules' },
  { slug: 'rear_delt_fly_cable',       name: 'Oiseau poulie',                        muscle: 'epaules' },
  { slug: 'arnold_press',              name: 'Arnold press',                         muscle: 'epaules' },
  { slug: 'upright_row',               name: 'Upright row',                          muscle: 'epaules' },

  // ─── BICEPS ───────────────────────────────────────────────────────────────
  { slug: 'curl_bar',                  name: 'Curl barre',                           muscle: 'biceps' },
  { slug: 'curl_db',                   name: 'Curl haltères',                        muscle: 'biceps' },
  { slug: 'hammer_curl',               name: 'Curl marteau',                         muscle: 'biceps' },
  { slug: 'incline_curl',              name: 'Curl incliné',                         muscle: 'biceps' },
  { slug: 'concentration_curl',        name: 'Curl concentré',                       muscle: 'biceps' },
  { slug: 'cable_curl',                name: 'Curl poulie basse',                    muscle: 'biceps' },
  { slug: 'ez_curl',                   name: 'Curl barre EZ',                        muscle: 'biceps' },

  // ─── TRICEPS ──────────────────────────────────────────────────────────────
  { slug: 'dips_triceps',              name: 'Dips triceps',                         muscle: 'triceps' },
  { slug: 'cable_pushdown',            name: 'Extensions poulie haute',              muscle: 'triceps' },
  { slug: 'skull_crusher',             name: 'Skull crusher',                        muscle: 'triceps' },
  { slug: 'close_grip_bench',          name: 'Développé serré',                      muscle: 'triceps' },
  { slug: 'kickback_db',               name: 'Kick-back haltère',                    muscle: 'triceps' },
  { slug: 'overhead_ext_db',           name: 'Extensions overhead haltère',          muscle: 'triceps' },
  { slug: 'overhead_ext_cable',        name: 'Extensions overhead poulie',           muscle: 'triceps' },
  { slug: 'uni_pushdown_cable',        name: 'Extension unilatérale poulie haute',   muscle: 'triceps' },
  { slug: 'uni_overhead_ext_db',       name: 'Extension unilatérale overhead haltère', muscle: 'triceps' },
  { slug: 'uni_kickback_cable',        name: 'Kick-back unilatéral poulie',          muscle: 'triceps' },
  { slug: 'uni_overhead_ext_cable',    name: 'Extension unilatérale overhead poulie', muscle: 'triceps' },

  // ─── AVANT-BRAS ───────────────────────────────────────────────────────────
  { slug: 'wrist_curl',                name: 'Curl poignet barre',                   muscle: 'avant-bras' },
  { slug: 'reverse_wrist_curl',        name: 'Curl poignet inversé',                 muscle: 'avant-bras' },
  { slug: 'farmer_carry',              name: 'Farmer carry',                         muscle: 'avant-bras' },

  // ─── QUADRICEPS ───────────────────────────────────────────────────────────
  { slug: 'squat_bar',                 name: 'Squat barre',                          muscle: 'quadriceps' },
  { slug: 'squat_db',                  name: 'Squat haltères',                       muscle: 'quadriceps' },
  { slug: 'pendulum_squat',            name: 'Squat pendule',                        muscle: 'quadriceps' },
  { slug: 'leg_press',                 name: 'Presse à cuisses',                     muscle: 'quadriceps' },
  { slug: 'lunge_bar',                 name: 'Fentes barre',                         muscle: 'quadriceps' },
  { slug: 'lunge_db',                  name: 'Fentes haltères',                      muscle: 'quadriceps' },
  { slug: 'bulgarian_split_squat',     name: 'Fentes bulgares',                      muscle: 'quadriceps' },
  { slug: 'leg_extension',             name: 'Leg extension',                        muscle: 'quadriceps' },
  { slug: 'hack_squat',                name: 'Hack squat',                           muscle: 'quadriceps' },
  { slug: 'goblet_squat',              name: 'Goblet squat',                         muscle: 'quadriceps' },

  // ─── ISCHIOS ──────────────────────────────────────────────────────────────
  { slug: 'lying_leg_curl',            name: 'Leg curl couché',                      muscle: 'ischios' },
  { slug: 'seated_leg_curl',           name: 'Leg curl assis',                       muscle: 'ischios' },
  { slug: 'stiff_leg_deadlift',        name: 'Soulevé de terre jambes tendues',       muscle: 'ischios' },
  { slug: 'good_morning',              name: 'Good morning',                         muscle: 'ischios' },
  { slug: 'reverse_lunge',             name: 'Fentes arrière',                       muscle: 'ischios' },

  // ─── FESSIERS ─────────────────────────────────────────────────────────────
  { slug: 'hip_thrust_bar',            name: 'Hip thrust barre',                     muscle: 'fessiers' },
  { slug: 'hip_thrust_db',             name: 'Hip thrust haltère',                   muscle: 'fessiers' },
  { slug: 'cable_abduction',           name: 'Abduction poulie',                     muscle: 'fessiers' },
  { slug: 'cable_kickback',            name: 'Kickback poulie',                      muscle: 'fessiers' },
  { slug: 'lateral_lunge',             name: 'Fentes latérales',                     muscle: 'fessiers' },
  { slug: 'sumo_squat',                name: 'Squat sumo',                           muscle: 'fessiers' },

  // ─── MOLLETS ──────────────────────────────────────────────────────────────
  { slug: 'standing_calf_machine',     name: 'Mollets debout machine',               muscle: 'mollets' },
  { slug: 'seated_calf_machine',       name: 'Mollets assis machine',                muscle: 'mollets' },
  { slug: 'standing_calf_db',          name: 'Mollets debout haltères',              muscle: 'mollets' },
  { slug: 'calf_press',                name: 'Mollets à la presse',                  muscle: 'mollets' },

  // ─── ABDOS ────────────────────────────────────────────────────────────────
  { slug: 'crunches',                  name: 'Crunchs',                              muscle: 'abdos' },
  { slug: 'reverse_crunches',          name: 'Crunchs inversés',                     muscle: 'abdos' },
  { slug: 'leg_raises',                name: 'Relevé de jambes',                     muscle: 'abdos' },
  { slug: 'plank',                     name: 'Planche',                              muscle: 'abdos' },
  { slug: 'side_plank',                name: 'Planche latérale',                     muscle: 'abdos' },
  { slug: 'ab_wheel',                  name: 'Rouleau abdominal',                    muscle: 'abdos' },
  { slug: 'russian_twist',             name: 'Russian twist',                        muscle: 'abdos' },
  { slug: 'mountain_climbers',         name: 'Mountain climbers',                    muscle: 'abdos' },
  { slug: 'cable_twist',               name: 'Torsions cable',                       muscle: 'abdos' },

  // ─── LOMBAIRES ────────────────────────────────────────────────────────────
  { slug: 'hyperextensions',           name: 'Hyperextensions',                      muscle: 'lombaires' },
  { slug: 'good_morning_lower',        name: 'Good morning',                         muscle: 'lombaires' },
  { slug: 'superman',                  name: 'Superman',                             muscle: 'lombaires' },

  // ─── TRAPÈZES ─────────────────────────────────────────────────────────────
  { slug: 'shrugs_bar_trap',           name: 'Shrugs barre',                         muscle: 'trapezes' },
  { slug: 'shrugs_db_trap',            name: 'Shrugs haltères',                      muscle: 'trapezes' },
  { slug: 'upright_row_trap',          name: 'Upright row',                          muscle: 'trapezes' },
  { slug: 'face_pull_trap',            name: 'Face pull',                            muscle: 'trapezes' },
];

export function searchExercises(query: string): ExerciseLibraryItem[] {
  const q = query.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  return EXERCISE_LIBRARY.filter((e) =>
    e.name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').includes(q)
  );
}

export function getExerciseBySlug(slug: string): ExerciseLibraryItem | undefined {
  return EXERCISE_LIBRARY.find((e) => e.slug === slug);
}

export function getExercisesByMuscle(muscle: MuscleGroup): ExerciseLibraryItem[] {
  return EXERCISE_LIBRARY.filter((e) => e.muscle === muscle);
}
