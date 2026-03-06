"""Comprehensive Medical Extraction Schema for ICU/Post-Operative Clinical Notes.

This module defines a LangExtract schema for structured extraction of clinical
information from unorganized ICU and post-operative medical records.

Extraction classes:
  - patient_demographics        : Age, sex, weight, admission dates, code status
  - past_medical_history        : Pre-existing conditions and prior procedures
  - primary_diagnosis           : Principal admission diagnosis/reason
  - surgical_procedure          : Operative details, levels, technique, surgeon
  - intraoperative_event        : Intraop complications, fluids, transfusions, vasopressors
  - hospital_course_entry       : Daily progress note events (POD-indexed)
  - active_problem              : Active diagnoses/problems by organ system
  - medication                  : Drug name, dose, route, frequency, status
  - lab_result                  : Lab value, reference range, date, flag
  - blood_gas                   : ABG/VBG components with date and ventilator context
  - imaging_result              : Modality, date, impression summary
  - microbiology_result         : Culture source, organism, susceptibility, date
  - vital_sign                  : Parameter, value, timestamp
  - ventilator_setting          : Mode, FiO2, PEEP, tidal volume, pressures, date
  - line_drain_tube             : Device type, location, status, output
  - transfusion_event           : Blood product, units, date, indication
  - consult                     : Consulting service, date, key recommendation
  - care_plan_item              : System-based goal or action
  - vte_prophylaxis             : Mechanical and pharmacologic VTE measures
  - future_appointment          : Date, provider, department
"""

from __future__ import annotations

import textwrap

import langextract as lx

# ---------------------------------------------------------------------------
# Extraction prompt
# ---------------------------------------------------------------------------

MEDICAL_EXTRACTION_PROMPT = textwrap.dedent("""\
    You are an expert clinical data abstractor. Extract all medically relevant
    entities from the clinical note below into the appropriate extraction class.

    Rules:
    - Use exact text spans where possible; do not paraphrase.
    - Assign every entity to exactly one extraction_class from the defined list.
    - Populate as many attributes as the source text supports.
    - Preserve numeric values, units, and dates exactly as documented.
    - For trending lab/vital values, emit one extraction per time-point.
    - For medications, capture the most recent documented status (active/stopped).
    - Flag abnormal values in the "flag" attribute using H (high), L (low), or * (critical).
    - If information is ambiguous or missing, omit the attribute rather than guessing.
""")

# ---------------------------------------------------------------------------
# Labeled examples (one per extraction class to guide the model)
# ---------------------------------------------------------------------------

EXAMPLES = [
    # ------------------------------------------------------------------ #
    # patient_demographics
    # ------------------------------------------------------------------ #
    lx.data.ExampleData(
        text=(
            "41-year-old man admitted 3/2/2026 for planned deformity correction, "
            "weight 103.2 kg, FULL CODE."
        ),
        extractions=[
            lx.data.Extraction(
                extraction_class="patient_demographics",
                extraction_text="41-year-old man admitted 3/2/2026",
                attributes={
                    "age": "41",
                    "sex": "male",
                    "admission_date": "2026-03-02",
                    "weight_kg": "103.2",
                    "code_status": "FULL CODE",
                    "icu_admission_date": "2026-03-02",
                },
            ),
        ],
    ),

    # ------------------------------------------------------------------ #
    # past_medical_history
    # ------------------------------------------------------------------ #
    lx.data.ExampleData(
        text=(
            "hx of GERD, OSA on CPAP, congenital pectus excavatum s/p repair "
            "in middle school, prior L4-S1 fusion (1/2025)."
        ),
        extractions=[
            lx.data.Extraction(
                extraction_class="past_medical_history",
                extraction_text="GERD",
                attributes={"condition": "Gastroesophageal reflux disease", "status": "present on admission"},
            ),
            lx.data.Extraction(
                extraction_class="past_medical_history",
                extraction_text="OSA on CPAP",
                attributes={
                    "condition": "Obstructive sleep apnea",
                    "treatment": "CPAP/BiPAP at home",
                    "status": "present on admission",
                },
            ),
            lx.data.Extraction(
                extraction_class="past_medical_history",
                extraction_text="congenital pectus excavatum s/p repair in middle school",
                attributes={
                    "condition": "Congenital pectus excavatum",
                    "procedure": "surgical repair",
                    "timing": "middle school",
                    "status": "present on admission",
                },
            ),
            lx.data.Extraction(
                extraction_class="past_medical_history",
                extraction_text="prior L4-S1 fusion (1/2025)",
                attributes={
                    "condition": "Prior spinal fusion L4-S1",
                    "procedure": "L4-S1 instrumented fusion",
                    "date": "2025-01",
                    "status": "prior procedure",
                },
            ),
        ],
    ),

    # ------------------------------------------------------------------ #
    # primary_diagnosis
    # ------------------------------------------------------------------ #
    lx.data.ExampleData(
        text=(
            "Adult spinal deformity due to congenital L3 butterfly vertebra and "
            "lumbar pseudoarthrosis with severe chronic back pain and functional "
            "limitation despite prior L4-S1 fusion."
        ),
        extractions=[
            lx.data.Extraction(
                extraction_class="primary_diagnosis",
                extraction_text=(
                    "adult spinal deformity due to congenital L3 butterfly vertebra "
                    "and lumbar pseudoarthrosis"
                ),
                attributes={
                    "icd_description": "Adult spinal deformity",
                    "etiology": "Congenital L3 butterfly vertebra; lumbar pseudoarthrosis",
                    "symptoms": "severe chronic back pain; functional limitation",
                    "failed_treatment": "L4-S1 fusion January 2025",
                },
            ),
        ],
    ),

    # ------------------------------------------------------------------ #
    # surgical_procedure
    # ------------------------------------------------------------------ #
    lx.data.ExampleData(
        text=(
            "T9-pelvis posterior spinal instrumented fusion with L3 vertebral column "
            "resection, T12-L2 posterior column osteotomies, and T12-S1 decompression "
            "performed by Dr. Clifton on 3/2/2026."
        ),
        extractions=[
            lx.data.Extraction(
                extraction_class="surgical_procedure",
                extraction_text=(
                    "T9-pelvis posterior spinal instrumented fusion with L3 vertebral "
                    "column resection, T12-L2 posterior column osteotomies, and T12-S1 "
                    "decompression"
                ),
                attributes={
                    "procedure_date": "2026-03-02",
                    "surgeon": "Dr. William E. Clifton, MD",
                    "primary_procedure": "T9-pelvis posterior spinal instrumented fusion",
                    "ancillary_procedure_1": "L3 vertebral column resection (VCR)",
                    "ancillary_procedure_2": "T12-L2 posterior column osteotomies",
                    "ancillary_procedure_3": "T12-S1 decompression",
                    "approach": "posterior",
                    "levels": "T9 to pelvis",
                    "classification": "elective deformity correction",
                },
            ),
        ],
    ),

    # ------------------------------------------------------------------ #
    # intraoperative_event
    # ------------------------------------------------------------------ #
    lx.data.ExampleData(
        text=(
            "Case was prolonged with high blood loss EBL 2.2L requiring cell saver "
            "return and transfusion (3u PRBC, 4u cryo) with intra-op acidemia and "
            "mild lactic elevation. Received 7L crystalloids, 2250 mL albumin. "
            "Levophed at 6 mcg/min intraop. CVC and Aline placed."
        ),
        extractions=[
            lx.data.Extraction(
                extraction_class="intraoperative_event",
                extraction_text="EBL 2.2L",
                attributes={
                    "event_type": "estimated blood loss",
                    "value": "2200 mL",
                    "flag": "H",
                    "management": "cell saver return; 3u PRBC; 4u cryoprecipitate (400 mL)",
                },
            ),
            lx.data.Extraction(
                extraction_class="intraoperative_event",
                extraction_text="intra-op acidemia and mild lactic elevation",
                attributes={
                    "event_type": "metabolic complication",
                    "finding_1": "intraoperative acidemia",
                    "finding_2": "mild lactic elevation",
                },
            ),
            lx.data.Extraction(
                extraction_class="intraoperative_event",
                extraction_text="7L crystalloids, 2250 mL albumin",
                attributes={
                    "event_type": "intraoperative fluid administration",
                    "crystalloid_volume_mL": "7000",
                    "albumin_volume_mL": "2250",
                },
            ),
            lx.data.Extraction(
                extraction_class="intraoperative_event",
                extraction_text="Levophed at 6 mcg/min intraop",
                attributes={
                    "event_type": "intraoperative vasopressor",
                    "drug": "Norepinephrine (Levophed)",
                    "dose": "6 mcg/min",
                    "indication": "hemodynamic support",
                },
            ),
        ],
    ),

    # ------------------------------------------------------------------ #
    # hospital_course_entry
    # ------------------------------------------------------------------ #
    lx.data.ExampleData(
        text=(
            "3/3 POD1: HV x2 with HV#1 output 440cc overnight. Transitioning from "
            "propofol to precedex for SBT. Concern for TACO given increased respiratory "
            "requirements and CXR findings. IV lasix 20 mg x2 given."
        ),
        extractions=[
            lx.data.Extraction(
                extraction_class="hospital_course_entry",
                extraction_text="POD1: HV x2 with HV#1 output 440cc overnight",
                attributes={
                    "date": "2026-03-03",
                    "pod": "1",
                    "system": "surgical/drains",
                    "event": "HV drain #1 output 440 mL overnight; HV #2 no drainage recorded",
                },
            ),
            lx.data.Extraction(
                extraction_class="hospital_course_entry",
                extraction_text="Transitioning from propofol to precedex for SBT",
                attributes={
                    "date": "2026-03-03",
                    "pod": "1",
                    "system": "sedation/respiratory",
                    "event": "Transition propofol to dexmedetomidine for spontaneous breathing trial",
                },
            ),
            lx.data.Extraction(
                extraction_class="hospital_course_entry",
                extraction_text="Concern for TACO given increased respiratory requirements",
                attributes={
                    "date": "2026-03-03",
                    "pod": "1",
                    "system": "pulmonary/cardiac",
                    "event": "Concern for transfusion-associated circulatory overload (TACO)",
                    "management": "IV furosemide 20 mg x2",
                },
            ),
        ],
    ),

    # ------------------------------------------------------------------ #
    # active_problem
    # ------------------------------------------------------------------ #
    lx.data.ExampleData(
        text=(
            "Ophthalmology consulted and suspect perioperative posterior ischemic "
            "optic neuropathy (PION). R eye: no light perception, afferent pupillary "
            "defect. L eye: superior peripheral vision intact."
        ),
        extractions=[
            lx.data.Extraction(
                extraction_class="active_problem",
                extraction_text="perioperative posterior ischemic optic neuropathy",
                attributes={
                    "organ_system": "ophthalmology",
                    "diagnosis": "Perioperative posterior ischemic optic neuropathy (PION)",
                    "onset_date": "2026-03-04",
                    "pod_onset": "2",
                    "right_eye": "no light perception; afferent pupillary defect; 6mm sluggish NPI 1",
                    "left_eye": "superior peripheral vision intact; 4mm brisk",
                    "management": "IV methylprednisolone 1g daily x3d; MAP goal 90-130 mmHg",
                    "consulting_service": "Ophthalmology",
                },
            ),
        ],
    ),

    # ------------------------------------------------------------------ #
    # medication
    # ------------------------------------------------------------------ #
    lx.data.ExampleData(
        text=(
            "NORepinephrine iv infusion 16 mg in D5W 250 mL (LEVOPHED) CONTINUOUS "
            "0.6-10 mcg/min IV. Last rate 5 mcg/min at 03/06/26 1130."
        ),
        extractions=[
            lx.data.Extraction(
                extraction_class="medication",
                extraction_text="NORepinephrine iv infusion (LEVOPHED) 5 mcg/min",
                attributes={
                    "generic_name": "norepinephrine",
                    "brand_name": "Levophed",
                    "dose": "5 mcg/min",
                    "dose_range": "0.6-10 mcg/min",
                    "route": "intravenous",
                    "frequency": "continuous infusion",
                    "status": "active",
                    "indication": "MAP augmentation 90-130 mmHg (PION)",
                    "last_documented_rate_datetime": "2026-03-06T11:30",
                },
            ),
        ],
    ),

    # ------------------------------------------------------------------ #
    # lab_result
    # ------------------------------------------------------------------ #
    lx.data.ExampleData(
        text="WBC 16.17* on 03/06/26 0627 (ref 3.70-11.00 k/uL). Hgb 9.6* (ref 13.0-17.0)."),
        extractions=[
            lx.data.Extraction(
                extraction_class="lab_result",
                extraction_text="WBC 16.17*",
                attributes={
                    "test_name": "White blood cell count",
                    "value": "16.17",
                    "unit": "k/uL",
                    "reference_range": "3.70-11.00",
                    "flag": "H",
                    "datetime": "2026-03-06T06:27",
                },
            ),
            lx.data.Extraction(
                extraction_class="lab_result",
                extraction_text="Hgb 9.6*",
                attributes={
                    "test_name": "Hemoglobin",
                    "value": "9.6",
                    "unit": "g/dL",
                    "reference_range": "13.0-17.0",
                    "flag": "L",
                    "datetime": "2026-03-06T06:27",
                },
            ),
        ],
    ),

    # ------------------------------------------------------------------ #
    # blood_gas
    # ------------------------------------------------------------------ #
    lx.data.ExampleData(
        text=(
            "ABG 03/05/26 1825: pH 7.48*, pCO2 37, pO2 96*, HCO3 27*, BE 4*, "
            "SpO2 98%, Lactate 1.9, Hgb 10.5* on vent FiO2 35%."
        ),
        extractions=[
            lx.data.Extraction(
                extraction_class="blood_gas",
                extraction_text="ABG 03/05/26 1825",
                attributes={
                    "type": "arterial",
                    "datetime": "2026-03-05T18:25",
                    "pH": "7.48",
                    "pH_flag": "H",
                    "pCO2_mmHg": "37",
                    "pO2_mmHg": "96",
                    "pO2_flag": "H",
                    "HCO3_mmolL": "27",
                    "HCO3_flag": "H",
                    "base_excess": "4",
                    "BE_flag": "H",
                    "SpO2_pct": "98",
                    "lactate_mmolL": "1.9",
                    "Hgb_gdL": "10.5",
                    "O2_therapy": "mechanical ventilator",
                    "FiO2_pct": "35",
                },
            ),
        ],
    ),

    # ------------------------------------------------------------------ #
    # imaging_result
    # ------------------------------------------------------------------ #
    lx.data.ExampleData(
        text=(
            "CT CHEST W IVCON 3/5/2026: Multifocal consolidations and ground-glass "
            "opacities in both upper lobes, more on the left, concerning for infection. "
            "Small bilateral pleural effusions with adjacent atelectasis."
        ),
        extractions=[
            lx.data.Extraction(
                extraction_class="imaging_result",
                extraction_text=(
                    "Multifocal consolidations and ground-glass opacities in both upper "
                    "lobes, more on the left, concerning for infection"
                ),
                attributes={
                    "modality": "CT",
                    "body_region": "chest",
                    "contrast": "with IV contrast",
                    "date": "2026-03-05",
                    "finding_1": "Multifocal consolidations and GGOs bilateral upper lobes (L>R) - c/f infection",
                    "finding_2": "Small bilateral pleural effusions with adjacent atelectasis",
                    "interpreter": "Aamer Chughtai, MD",
                },
            ),
        ],
    ),

    # ------------------------------------------------------------------ #
    # microbiology_result
    # ------------------------------------------------------------------ #
    lx.data.ExampleData(
        text=(
            "Respiratory Culture 3/3/2026: Few normal respiratory flora. "
            "Rare Staphylococcus aureus - insignificant colony count, no further "
            "workup. Gram stain: Moderate mixed oral flora, Moderate PMNs. "
            "No Pseudomonas aeruginosa isolated. Nares: MSSA positive."
        ),
        extractions=[
            lx.data.Extraction(
                extraction_class="microbiology_result",
                extraction_text="Rare Staphylococcus aureus - insignificant colony count",
                attributes={
                    "collection_date": "2026-03-03",
                    "specimen_type": "sputum",
                    "culture_type": "respiratory",
                    "organism": "Staphylococcus aureus",
                    "colony_count": "rare",
                    "clinical_significance": "insignificant",
                    "susceptibility": "MSSA (methicillin-sensitive)",
                    "gram_stain": "Moderate mixed oral flora; Moderate PMNs",
                    "notes": "No Pseudomonas aeruginosa isolated",
                },
            ),
        ],
    ),

    # ------------------------------------------------------------------ #
    # vital_sign
    # ------------------------------------------------------------------ #
    lx.data.ExampleData(
        text="03/06/26 1420: BP 131/62, Pulse 116, SpO2 100%, RR 19."),
        extractions=[
            lx.data.Extraction(
                extraction_class="vital_sign",
                extraction_text="BP 131/62",
                attributes={
                    "parameter": "blood pressure",
                    "systolic_mmHg": "131",
                    "diastolic_mmHg": "62",
                    "datetime": "2026-03-06T14:20",
                },
            ),
            lx.data.Extraction(
                extraction_class="vital_sign",
                extraction_text="Pulse 116",
                attributes={
                    "parameter": "heart rate",
                    "value_bpm": "116",
                    "flag": "H",
                    "datetime": "2026-03-06T14:20",
                },
            ),
            lx.data.Extraction(
                extraction_class="vital_sign",
                extraction_text="SpO2 100%",
                attributes={
                    "parameter": "oxygen saturation",
                    "value_pct": "100",
                    "datetime": "2026-03-06T14:20",
                },
            ),
        ],
    ),

    # ------------------------------------------------------------------ #
    # ventilator_setting
    # ------------------------------------------------------------------ #
    lx.data.ExampleData(
        text=(
            "Vent mode PC-CSVs (Pressure Support/CPAP), FiO2 35%, RR 15, "
            "TV 500 mL, PEEP 8 cmH2O, inspiratory pressure 8 above PEEP, "
            "PIP 21 cmH2O, I:E 1:2.0 on 03/06/26 1420."
        ),
        extractions=[
            lx.data.Extraction(
                extraction_class="ventilator_setting",
                extraction_text="PC-CSVs mode FiO2 35% PEEP 8",
                attributes={
                    "datetime": "2026-03-06T14:20",
                    "mode": "Pressure Support CPAP (PC-CSVs)",
                    "FiO2_pct": "35",
                    "set_RR_bpm": "15",
                    "tidal_volume_set_mL": "500",
                    "PEEP_cmH2O": "8",
                    "inspiratory_pressure_above_PEEP_cmH2O": "8",
                    "peak_inspiratory_pressure_cmH2O": "21",
                    "IE_ratio": "1:2.0",
                    "SpO2_target_pct": "90-96",
                },
            ),
        ],
    ),

    # ------------------------------------------------------------------ #
    # line_drain_tube
    # ------------------------------------------------------------------ #
    lx.data.ExampleData(
        text=(
            "CVC right IJ multilumen tip at superior cavoatrial junction. "
            "A-line present. ETT ~6 cm above carina. HV drain #1 output 150cc "
            "on 3/5; HV drain #2 no output. Foley catheter in place."
        ),
        extractions=[
            lx.data.Extraction(
                extraction_class="line_drain_tube",
                extraction_text="CVC right IJ multilumen tip at superior cavoatrial junction",
                attributes={
                    "device_type": "central venous catheter (CVC)",
                    "location": "right internal jugular vein",
                    "tip_position": "superior cavoatrial junction",
                    "lumen_type": "multilumen",
                    "status": "active",
                },
            ),
            lx.data.Extraction(
                extraction_class="line_drain_tube",
                extraction_text="ETT ~6 cm above carina",
                attributes={
                    "device_type": "endotracheal tube (ETT)",
                    "position": "approximately 6 cm above carina",
                    "status": "active",
                },
            ),
            lx.data.Extraction(
                extraction_class="line_drain_tube",
                extraction_text="HV drain #1 output 150cc on 3/5",
                attributes={
                    "device_type": "Hemovac drain",
                    "drain_number": "1",
                    "output_mL": "150",
                    "output_date": "2026-03-05",
                    "status": "active",
                    "setting": "suction",
                },
            ),
            lx.data.Extraction(
                extraction_class="line_drain_tube",
                extraction_text="HV drain #2 no output",
                attributes={
                    "device_type": "Hemovac drain",
                    "drain_number": "2",
                    "output_mL": "0",
                    "status": "active",
                    "setting": "suction",
                },
            ),
        ],
    ),

    # ------------------------------------------------------------------ #
    # transfusion_event
    # ------------------------------------------------------------------ #
    lx.data.ExampleData(
        text=(
            "Transfused 3u PRBC and 4u cryoprecipitate intraoperatively. "
            "Received additional 2u PRBC in NICU overnight 3/2-3/3. "
            "Cell saver return used intraoperatively."
        ),
        extractions=[
            lx.data.Extraction(
                extraction_class="transfusion_event",
                extraction_text="3u PRBC intraoperatively",
                attributes={
                    "product": "packed red blood cells (PRBC)",
                    "units": "3",
                    "timing": "intraoperative",
                    "date": "2026-03-02",
                    "indication": "significant blood loss EBL 2.2L",
                },
            ),
            lx.data.Extraction(
                extraction_class="transfusion_event",
                extraction_text="4u cryoprecipitate intraoperatively",
                attributes={
                    "product": "cryoprecipitate",
                    "units": "4",
                    "volume_mL": "400",
                    "timing": "intraoperative",
                    "date": "2026-03-02",
                    "indication": "coagulopathy management",
                },
            ),
            lx.data.Extraction(
                extraction_class="transfusion_event",
                extraction_text="additional 2u PRBC in NICU overnight",
                attributes={
                    "product": "packed red blood cells (PRBC)",
                    "units": "2",
                    "timing": "overnight POD0-1",
                    "date": "2026-03-02",
                    "indication": "ongoing anemia",
                },
            ),
        ],
    ),

    # ------------------------------------------------------------------ #
    # consult
    # ------------------------------------------------------------------ #
    lx.data.ExampleData(
        text=(
            "GI consulted 3/5 for bright red blood via OG. Per GI note 3/6: "
            "No EGD needed at this time. Continue IV PPI for 72 hours total, "
            "then PO daily."
        ),
        extractions=[
            lx.data.Extraction(
                extraction_class="consult",
                extraction_text="GI consulted for bright red blood via OG",
                attributes={
                    "consulting_service": "Gastroenterology (GI)",
                    "consult_date": "2026-03-05",
                    "indication": "bright red blood via OG tube (suspected upper GI bleed)",
                    "recommendation_1": "No EGD needed at this time",
                    "recommendation_2": "Continue IV pantoprazole BID for 72 hours total",
                    "recommendation_3": "Transition to PO pantoprazole daily thereafter",
                    "follow_up": "Monitor Hgb; EGD if Hgb drops >1 unit",
                },
            ),
        ],
    ),

    # ------------------------------------------------------------------ #
    # care_plan_item
    # ------------------------------------------------------------------ #
    lx.data.ExampleData(
        text=(
            "Plan: Lung-protective ventilation. PEEP 8 minimum given likely baseline "
            "restrictive lung disease. Assess readiness for extubation when stable. "
            "Consider bronchoscopy today given respiratory status."
        ),
        extractions=[
            lx.data.Extraction(
                extraction_class="care_plan_item",
                extraction_text="Lung-protective ventilation, PEEP 8 minimum",
                attributes={
                    "organ_system": "pulmonary",
                    "goal": "lung-protective ventilation",
                    "rationale": "likely baseline restrictive lung disease (pectus excavatum)",
                    "parameter": "PEEP minimum 8 cmH2O",
                },
            ),
            lx.data.Extraction(
                extraction_class="care_plan_item",
                extraction_text="Assess readiness for extubation when stable",
                attributes={
                    "organ_system": "pulmonary",
                    "goal": "ventilator liberation",
                    "action": "daily SBT protocol per RT; SAT assessment daily",
                    "precaution": "OSA history; monitor closely post-extubation",
                },
            ),
        ],
    ),

    # ------------------------------------------------------------------ #
    # vte_prophylaxis
    # ------------------------------------------------------------------ #
    lx.data.ExampleData(
        text=(
            "VTE Assessment: Surgical Moderate Risk. "
            "SCDs to bilateral lower extremities continuously. "
            "Heparin 5000 Units SQ q8H started POD2."
        ),
        extractions=[
            lx.data.Extraction(
                extraction_class="vte_prophylaxis",
                extraction_text="SCDs to bilateral lower extremities continuously",
                attributes={
                    "type": "mechanical prophylaxis",
                    "device": "sequential compression device (SCD)",
                    "application": "bilateral lower extremities",
                    "frequency": "continuous except bathing/ambulation",
                },
            ),
            lx.data.Extraction(
                extraction_class="vte_prophylaxis",
                extraction_text="Heparin 5000 Units SQ q8H started POD2",
                attributes={
                    "type": "pharmacologic prophylaxis",
                    "drug": "unfractionated heparin",
                    "dose": "5000 Units",
                    "route": "subcutaneous",
                    "frequency": "every 8 hours",
                    "start_pod": "2",
                    "start_date": "2026-03-04",
                },
            ),
        ],
    ),

    # ------------------------------------------------------------------ #
    # future_appointment
    # ------------------------------------------------------------------ #
    lx.data.ExampleData(
        text=(
            "Follow-up: 6/5/2026 10:20 AM with Dr. William E. Clifton, MD "
            "at SPSWIL WilloughbyFH."
        ),
        extractions=[
            lx.data.Extraction(
                extraction_class="future_appointment",
                extraction_text="6/5/2026 10:20 AM with Dr. William E. Clifton, MD",
                attributes={
                    "date": "2026-06-05",
                    "time": "10:20",
                    "provider": "William E. Clifton, MD",
                    "specialty": "Spine Surgery",
                    "department": "SPSWIL",
                    "location": "WilloughbyFH",
                },
            ),
        ],
    ),
]

# ---------------------------------------------------------------------------
# Schema usage example
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    print("Medical Extraction Schema defined successfully.")
    print(f"Number of extraction classes demonstrated: {len(EXAMPLES)}")
    print("\nExtraction classes:")
    seen = set()
    for ex in EXAMPLES:
        for extraction in ex.extractions:
            cls = extraction.extraction_class
            if cls not in seen:
                print(f"  - {cls}")
                seen.add(cls)

    print("\nTo run extraction (requires API key):")
    print("""
import langextract as lx
from examples.medical_extraction_schema import (
    MEDICAL_EXTRACTION_PROMPT, EXAMPLES
)

result = lx.extract(
    text_or_documents=clinical_note_text,
    prompt_description=MEDICAL_EXTRACTION_PROMPT,
    examples=EXAMPLES,
    model_id="gemini-2.5-flash",
)
""")
