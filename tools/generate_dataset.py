import os
import random
import argparse
import json
from pathlib import Path

# --- コマンドライン引数 ---
parser = argparse.ArgumentParser()
parser.add_argument("--scenario", type=str, default=None, help="シナリオ名を指定するとJSONから読み込み")
parser.add_argument("--files", type=int, default=None)
parser.add_argument("--tag-types", type=int, default=None)
parser.add_argument("--tags-per-file", type=int, default=None)
parser.add_argument("--depth", type=int, default=None)
parser.add_argument("--size", type=int, default=None)
parser.add_argument("--heavy-tag", type=str, default=None)
parser.add_argument("--heavy-ratio", type=float, default=None)
parser.add_argument("--seed", type=int, default=None)
parser.add_argument("--output", type=str, default="testdata")
parser.add_argument("--scenario-file", type=str, default="benchmarks/scenarios.json",
                    help="シナリオJSONファイルのパス")
args = parser.parse_args()

# --- シナリオ読み込み ---
if args.scenario:
    with open(args.scenario_file, "r") as f:
        scenarios = json.load(f)
    matched = next((s for s in scenarios if s["name"] == args.scenario), None)
    if not matched:
        raise ValueError(f"Scenario '{args.scenario}' が見つかりません")
    # JSONの値で上書き
    args.files = matched.get("files", args.files)
    args.tag_types = matched.get("tag_types", args.tag_types)
    args.tags_per_file = matched.get("tags_per_file", args.tags_per_file)
    args.depth = matched.get("depth", args.depth)
    args.size = matched.get("size", args.size)
    args.heavy_tag = matched.get("heavy_tag", args.heavy_tag)
    args.heavy_ratio = matched.get("heavy_ratio", args.heavy_ratio)
    args.seed = matched.get("seed", args.seed)
    args.output = matched.get("output", args.output)

# --- シード固定 ---
if args.seed is not None:
    random.seed(args.seed)

# --- 出力フォルダ ---
Path(args.output).mkdir(exist_ok=True)

# --- タグ生成 ---
def generate_tag(i):
    parts = [f"tag{i}"]
    for _ in range((args.depth or 1) - 1):
        parts.append(f"sub{random.randint(0,10)}")
    return "/".join(parts)

tag_pool = [generate_tag(i) for i in range(args.tag_types or 100)]

# --- ファイル生成 ---
for i in range(args.files or 1000):
    tags = random.sample(tag_pool, args.tags_per_file or 2)
    if args.heavy_tag and random.random() < (args.heavy_ratio or 0.0):
        tags[0] = args.heavy_tag

    content = f"# Title {i}\n\n"
    content += " ".join([f"#{t}" for t in tags])
    content += "\n\n"
    content += ("Lorem ipsum dolor sit amet. " * ((args.size or 1000) // 28))

    with open(f"{args.output}/note_{i}.md", "w") as f:
        f.write(content)
