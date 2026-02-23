# Benchmarks for VS Journal

This folder contains predefined scenarios and datasets for performance and UX testing of the VS Journal extension.

---

## Folder Structure

The folder structure is as follows:

```
benchmarks/
|-- scenarios.json      # Predefined scenarios for dataset generation
|-- datasets/           # Generated test datasets (ignored in Git)
`-- README.md           # This file
```

Note: Only the datasets/ folder is ignored in Git. Scripts and scenario JSONs are committed.

---

## Scenario Management

Each scenario defines parameters for dataset generation. Example:

```
{
  "name": "heavy_10k",
  "files": 10000,
  "tag_types": 200,
  "tags_per_file": 3,
  "heavy_tag": "project",
  "heavy_ratio": 0.8,
  "depth": 3,
  "size": 1500,
  "seed": 42,
  "output": "datasets/heavy_10k"
}
```

Parameter explanations:

- name: Unique scenario identifier
- files: Number of Markdown files
- tag_types: Number of unique tags
- tags_per_file: Tags per file
- heavy_tag (optional): Tag that appears in many files
- heavy_ratio (optional): Probability (0–1) for heavy tag inclusion
- depth: Tag hierarchy depth (1 = no hierarchy)
- size: Approximate character count per file
- seed: Random seed for reproducibility
- output: Destination folder for generated files

---

## Using a scenario

To generate a dataset from a scenario:

```
python ../tools/generate_dataset.py --scenario heavy_10k
```

The script reads parameters from scenarios.json and generates the dataset automatically.

---

## Recommended Workflow

1. Add new scenarios in scenarios.json using unique names
2. Generate datasets locally inside benchmarks/datasets/
3. Use --seed for reproducibility
4. Organize scenarios by type:
   - balanced → uniform distribution of tags
   - heavy_tag → single tag dominates
   - large_files → very large Markdown files
   - deep_hierarchy → multi-level tags
5. Update README when adding new patterns

---

## Notes

- Commit scripts and scenario JSONs only; never commit generated datasets.
- Benchmarks can be used in automated CI testing or local performance checks.
