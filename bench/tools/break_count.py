"""Count vertical-stroke misalignment in text diagrams, measured in terminal (east-asian-width) columns.
dangling = a cell with an up (down) connector whose terminal-column neighbour above (below) is blank or a box char
without the matching connector. Neighbours that are label text are 'label breaks' and not counted."""
import sys, os, re, json, unicodedata
UP   = set('│┃║|├┤┼└┘┴╰╯┗┛╚╝┣┫╋┠┨▼▽vV')
DOWN = set('│┃║|├┤┼┌┐┬╭╮┏┓╔╗┣┫╋┠┨▲△^')
BOX  = set('─━═│┃║|├┤┼└┘┴╰╯┗┛╚╝┌┐┬╭╮┏┓╔╗┣┫╋┠┨▼▲►◄▶◀▽△◇◆<>+-=.:')
ANSI = re.compile(r'\x1b\[[0-9;]*[A-Za-z]')
def w(ch):
    if unicodedata.combining(ch): return 0
    return 2 if unicodedata.east_asian_width(ch) in ('W','F') else 1
def grid(text, mode):
    rows=[]
    for line in ANSI.sub('',text).split('\n'):
        cells={}; col=0
        for ch in line:
            cw = w(ch) if mode=='term' else 1
            cells[col]=ch
            for k in range(1,cw): cells[col+k]='\0'   # continuation of a wide char
            col+=cw
        rows.append(cells)
    return rows
def classify(nb, need):
    if nb is None or nb==' ': return 'dangling'
    if nb in need: return 'ok'
    if nb in BOX: return 'dangling'
    return 'label'
def measure(text, mode='term'):
    g=grid(text,mode); dang=0; strokes=0; lab=0; where=[]
    for r,cells in enumerate(g):
        for c,ch in cells.items():
            if ch in UP and ch not in 'vV^' :
                strokes+=1
                if r==0: k='dangling'
                else: k=classify(g[r-1].get(c), DOWN)
                if k=='dangling': dang+=1; where.append((r+1,c,ch,'up'))
                elif k=='label': lab+=1
            if ch in DOWN and ch not in 'vV^':
                if r==len(g)-1: k='dangling'
                else: k=classify(g[r+1].get(c), UP)
                if k=='dangling': dang+=1; where.append((r+1,c,ch,'down'))
                elif k=='label': lab+=1
    return dict(dangling=dang, strokes=strokes, label_breaks=lab, where=where[:12])
