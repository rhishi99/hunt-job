#!/bin/bash
# Hunt-Job — AI Job Search Agent (Unix/Linux/macOS)

set -e

# ── Load .env if present ─────────────────────────────────────────────────────
if [ -f ".env" ]; then
    # shellcheck disable=SC2046
    export $(grep -v '^#' .env | xargs)
fi

# ── Require Node.js ──────────────────────────────────────────────────────────
if ! command -v node &> /dev/null; then
    echo ""
    echo "  ERROR: Node.js not found."
    echo "  Download from: https://nodejs.org"
    echo ""
    exit 1
fi

# ── Parse command-line arguments ─────────────────────────────────────────────
case "${1:-menu}" in
    evaluate)
        node src/cli/evaluateJob.js "$2" "$3" "$4"
        ;;
    scan)
        node src/cli/scanPortals.js "$2" "$3" "$4" "$5"
        ;;
    resume)
        node src/cli/generateResume.js "$2"
        ;;
    prep)
        node src/cli/prepareInterview.js "$2" "$3"
        ;;
    setup)
        node src/cli/setupApiKey.js
        ;;
    parse-resume|parse)
        node src/cli/parseResume.js "$2"
        ;;
    profile)
        if [ "$2" = "init" ]; then
            node src/cli/profileInit.js
        elif [ "$2" = "edit" ]; then
            node src/cli/profileEdit.js
        else
            node src/cli/profileEdit.js
        fi
        ;;
    start|menu|interactive)
        node src/cli/interactive.js
        ;;
    *)
        # Show menu
        clear
        echo ""
        echo "  ╔══════════════════════════════════════════╗"
        echo "  ║   🎯  HUNT-JOB  —  Job Search Agent      ║"
        echo "  ╚══════════════════════════════════════════╝"
        echo ""
        echo "  ── Job Search ─────────────────────────────"
        echo "   [1]  Full Interactive Menu  (recommended)"
        echo "   [2]  Evaluate a Job"
        echo "   [3]  Scan Job Portals"
        echo "   [4]  Generate Resume"
        echo "   [5]  Interview Prep"
        echo ""
        echo "  ── Profile ────────────────────────────────"
        echo "   [6]  Setup API Keys"
        echo "   [7]  Initialize Profile"
        echo "   [8]  Edit Profile"
        echo "   [9]  Parse Resume PDF  (build profile from PDF)"
        echo ""
        echo "   [0]  Exit"
        echo ""
        read -p "  Enter your choice: " choice

        case "$choice" in
            1) node src/cli/interactive.js ;;
            2)
                read -p "  Paste job URL or description: " job_input
                node src/cli/evaluateJob.js "$job_input"
                ;;
            3)
                read -p "  Target archetype (e.g. Backend Engineer): " archetype
                node src/cli/scanPortals.js --archetype "$archetype"
                ;;
            4)
                read -p "  Job ID from evaluation: " job_id
                node src/cli/generateResume.js "$job_id"
                ;;
            5)
                read -p "  Job description text or path to .txt file: " prep_input
                node src/cli/prepareInterview.js "$prep_input"
                ;;
            6) node src/cli/setupApiKey.js ;;
            7) node src/cli/profileInit.js ;;
            8) node src/cli/profileEdit.js ;;
            9)
                read -p "  Path to resume PDF: " pdf_path
                node src/cli/parseResume.js "$pdf_path"
                ;;
            0) exit 0 ;;
            *) echo "Invalid choice"; exit 1 ;;
        esac
        ;;
esac
