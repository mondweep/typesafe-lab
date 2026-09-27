#!/bin/sh
cd /home/claude/kge/exp
OMP_NUM_THREADS=1 python3 -c "import torch;torch.set_num_threads(1);import runpy,sys;sys.argv=['x']+sys.argv[1:];runpy.run_path('ref_complex.py',run_name='__main__')" "$@"
