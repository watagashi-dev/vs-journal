# Dataset Generator for VS Journal

This folder contains scripts to generate test datasets for the VS Journal extension.

---

## Folder Structure

```
tools/
|-- generate_dataset.py    # Python script to create test datasets
`-- README.md             # This file
```

Note: Only the Python scripts are committed. Generated datasets should not be committed.

---

## Usage

### 1. Generate with command-line options

You can customize the dataset using parameters. Example:

```
python generate_dataset.py \
  --files 1000 \
  --tag-types 100 \
  --tags-per-file 2 \
  --depth 1 \
  --size 1000 \
  --heavy-tag project \
  --heavy-ratio 0.5 \
  --seed 42 \
  --output ../benchmarks/datasets/test
```

Parameters:

- files: Number of Markdown files to generate
- tag-types: Number of unique tags
- tags-per-file: Tags per file
- depth: Tag hierarchy depth (1 = no hierarchy)
- size: Approximate character count per file
- heavy-tag (optional): Tag that appears in many files
- heavy-ratio (optional): Probability (0–1) for heavy tag inclusion
- seed: Random seed for reproducibility
- output: Output folder

---

### 2. Generate using scenarios

If you have a `benchmarks/scenarios.json` file with predefined scenarios,
run the command from the project root:

```
python tools/generate_dataset.py --scenario heavy_10k
```

- The script reads parameters from the JSON file and generates the dataset automatically.
- The script will load scenarios from:
  benchmarks/scenarios.json
- Output folder, file count, tags, depth, and other settings are taken from the scenario.

---

## Recommendations

- Do not commit generated datasets to Git. Only commit scripts and scenario JSONs.
- Use `--seed` for reproducibility.
- For performance testing, create multiple scenarios with varying file counts, tag distributions, and file sizes.
