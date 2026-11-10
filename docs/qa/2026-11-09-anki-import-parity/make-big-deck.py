import os, sys, tempfile
from anki.collection import Collection
from anki.import_export_pb2 import ExportAnkiPackageOptions
out = sys.argv[1]
col = Collection(os.path.join(tempfile.mkdtemp(), "c.anki2"))
did = col.decks.id("Big Pharm")
basic = col.models.by_name("Basic")
tags = ["#AK_Step1_v12::#B&B::05_Pharm::01_Autonomic_Drugs::02_Cholinomimetics::Direct_Agonists"] + [f"#AK_Step1_v12::#UWorld::Step::{1000+i}" for i in range(40)]
for i in range(10050):
    n = col.new_note(basic); n["Front"] = f"Drug {i}"; n["Back"] = f"Mechanism {i}"
    if i < 5: n.tags = tags
    col.add_note(n, did)
col.export_anki_package(out_path=out, options=ExportAnkiPackageOptions(with_media=False, with_scheduling=False, with_deck_configs=False, legacy=False), limit=None)
print(col.card_count())
