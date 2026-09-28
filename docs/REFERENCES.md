# VAAYU — references

Every entry below was checked against its publisher / official page (2026-09-28).
"Used for" says where it enters this project.

## 1. The problem and the operational benchmark (Delhi)

| Reference | Used for |
|---|---|
| Jena, C., et al. (2021). *Performance of high resolution (400 m) PM2.5 forecast over Delhi.* **Scientific Reports** 11, 4104. [nature.com/articles/s41598-021-83467-8](https://www.nature.com/articles/s41598-021-83467-8) · [open access (PMC)](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC7892871/) | The MoES/IITM operational WRF-Chem system (400 m, 72 h, data assimilation), evaluated Oct 2019–Feb 2020. Our benchmark window and the day-1→day-3 bias growth VAAYU targets. |
| Ghude, S. D., et al. (2020). *Evaluation of PM2.5 forecast using chemical data assimilation in the WRF-Chem model: a novel initiative under the Ministry of Earth Sciences Air Quality Early Warning System for Delhi, India.* **Current Science** 118, 1803–1815. [OpenSky record](https://opensky.ucar.edu/islandora/object/articles:23419) | Description of the AQEWS (Air Quality Early Warning System) that SIH26082's sponsor runs. |
| *Air Quality Warning and Integrated Decision Support System for Emissions (AIRWISE): Enhancing Air Quality Management in Megacities.* **Bulletin of the AMS** 105(12), 2024. [journals.ametsoc.org](https://journals.ametsoc.org/view/journals/bams/105/12/BAMS-D-23-0181.1.xml) | Evolution of the Delhi system (decision support, source attribution); context for "what exists". |

## 2. Physics the model is built around

| Reference | Used for |
|---|---|
| Cusworth, D. H., Mickley, L. J., Sulprizio, M. P., Liu, T., Marlier, M. E., DeFries, R. S., Guttikunda, S. K., Gupta, P. (2018). *Quantifying the influence of agricultural fires in northwest India on urban air pollution in Delhi, India.* **Environmental Research Letters** 13(4). [doi:10.1088/1748-9326/aab303](https://iopscience.iop.org/article/10.1088/1748-9326/aab303) | Evidence that Punjab/Haryana stubble fires can roughly double Delhi PM2.5 in the post-monsoon season → fire-source graph nodes + upwind fire-influence score. |
| Ding, A. J., et al. (2016). *Enhanced haze pollution by black carbon in megacities in China.* **Geophysical Research Letters** 43, 2873–2879. [doi:10.1002/2016GL067745](https://agupubs.onlinelibrary.wiley.com/doi/full/10.1002/2016GL067745) | Aerosol → boundary-layer feedback ("dome effect"): the met←chemistry direction of the two-way coupling; basis of our perturbation test (more PM2.5 → lower BLH). |
| Li, Z., Guo, J., Ding, A., Liao, H., Liu, J., Sun, Y., et al. (2017). *Aerosol and boundary-layer interactions and impact on air quality.* **National Science Review** 4(6), 810–833. [doi:10.1093/nsr/nwx117](https://academic.oup.com/nsr/article/4/6/810/4191281) | Review of aerosol–PBL interaction; absorbing aerosols suppress PBL height → stagnation/inversion tracking. |
| *Sway of aerosol on Atmospheric Boundary Layer influencing air pollution of Delhi.* **Urban Climate** (2023). [sciencedirect.com/science/article/abs/pii/S221209552300072X](https://www.sciencedirect.com/science/article/abs/pii/S221209552300072X) | Delhi-specific evidence of the aerosol–boundary-layer effect. |

## 3. Physics baseline and data sources

| Reference / source | Used for |
|---|---|
| Peuch, V.-H., et al. (2022). *The Copernicus Atmosphere Monitoring Service: From Research to Operations.* **Bulletin of the AMS** 103(12). [journals.ametsoc.org](https://journals.ametsoc.org/view/journals/bams/103/12/BAMS-D-21-0314.1.xml) | CAMS — the open coupled weather-chemistry forecasting system VAAYU corrects. |
| CAMS global atmospheric composition **forecasts** dataset, Copernicus Atmosphere Data Store. [ads.atmosphere.copernicus.eu](https://ads.atmosphere.copernicus.eu/datasets/cams-global-atmospheric-composition-forecasts) | Baseline forecasts (PM2.5, PM10, NO2, O3, T2m, winds, BLH) keyed by issue time + lead time. |
| Hersbach, H., et al. (2020). *The ERA5 global reanalysis.* **Q. J. R. Meteorol. Soc.** 146(730), 1999–2049. [doi:10.1002/qj.3803](https://rmets.onlinelibrary.wiley.com/doi/10.1002/qj.3803) | Weather ground truth incl. boundary-layer height (via Open-Meteo archive and Copernicus CDS). |
| Schroeder, W., Oliva, P., Giglio, L., Csiszar, I. (2014). *The New VIIRS 375 m active fire detection data product: Algorithm description and initial assessment.* **Remote Sensing of Environment** 143, 85–96. [doi:10.1016/j.rse.2013.12.008](https://www.earthdata.nasa.gov/sites/default/files/imported/Schroeder_et_al_2014b_RSE.pdf) | The VIIRS active-fire product (via NASA FIRMS) used for stubble-burning detection. |
| NASA FIRMS — Fire Information for Resource Management System. [firms.modaps.eosdis.nasa.gov](https://firms.modaps.eosdis.nasa.gov/) · [VIIRS 375 m data](https://www.earthdata.nasa.gov/data/instruments/viirs/viirs-i-band-375-m-active-fire-data) | Fire detections over Punjab + Haryana, 2015–2025. |
| CPCB — *National Air Quality Index* (2014). [cpcb.nic.in/national-air-quality-index](https://cpcb.nic.in/displaypdf.php?id=bmF0aW9uYWwtYWlyLXF1YWxpdHktaW5kZXgvRklOQUwtUkVQT1JUX0FRSV8ucGRm) · [About AQI](https://www.cpcb.nic.in/displaypdf.php?id=bmF0aW9uYWwtYWlyLXF1YWxpdHktaW5kZXgvQWJvdXRfQVFJLnBkZg%3D%3D) | Official sub-index breakpoints and averaging periods used in `model/aqi.py` and all category/extreme metrics. |
| data.opencity.in — *Delhi Hourly Air Quality Reports.* [data.opencity.in/dataset/delhi-hourly-air-quality-reports](https://data.opencity.in/dataset/delhi-hourly-air-quality-reports) | 2024–25 station concentrations (39 stations) — training 2024, validation/test 2025. |
| Kaggle — *Air Quality Data in India (2015–2020)* (CPCB-compiled, CC0). [kaggle.com/datasets/rohanrao/air-quality-data-in-india](https://www.kaggle.com/datasets/rohanrao/air-quality-data-in-india) | 2015–mid-2020 station concentrations (42 NCR stations). |
| OpenAQ. [openaq.org](https://openaq.org/) · [API docs](https://docs.openaq.org/) | Station metadata/registry and sparse 2020–22 PM2.5; live feed. |
| Open-Meteo. [open-meteo.com](https://open-meteo.com/en/docs/historical-weather-api) | ERA5 archive access per station (T2m, wind, RH, BLH). |

## 4. Machine-learning methods

| Reference | Used for |
|---|---|
| Wang, S., Li, Y., Zhang, J., Meng, Q., Meng, L., Gao, F. (2020). *PM2.5-GNN: A Domain Knowledge Enhanced Graph Neural Network For PM2.5 Forecasting.* **SIGSPATIAL '20**. [doi:10.1145/3397536.3422208](https://dl.acm.org/doi/10.1145/3397536.3422208) · [arXiv:2002.12898](https://arxiv.org/abs/2002.12898) · [code](https://github.com/shuowang-ai/PM2.5-GNN) | Closest precedent: graph over monitoring sites with wind-direction-dependent edges + recurrent temporal model. |
| Brody, S., Alon, U., Yahav, E. (2022). *How Attentive are Graph Attention Networks?* **ICLR 2022**. [arXiv:2105.14491](https://arxiv.org/abs/2105.14491) | GATv2 — the spatial attention layer in `model/gnn_model.py`. |
| Fey, M., Lenssen, J. E. (2019). *Fast Graph Representation Learning with PyTorch Geometric.* [arXiv:1903.02428](https://arxiv.org/abs/1903.02428) | Graph library used for the GNN. |
| Bengio, S., Vinyals, O., Jaitly, N., Shazeer, N. (2015). *Scheduled Sampling for Sequence Prediction with Recurrent Neural Networks.* **NeurIPS 2015**. [arXiv:1506.03099](https://arxiv.org/abs/1506.03099) | Teacher forcing → scheduled sampling for the 72 h autoregressive rollout. |
| Glahn, H. R., Lowry, D. A. (1972). *The Use of Model Output Statistics (MOS) in Objective Weather Forecasting.* **J. Applied Meteorology** 11(8), 1203–1211. [journals.ametsoc.org](https://journals.ametsoc.org/view/journals/apme/11/8/1520-0450_1972_011_1203_tuomos_2_0_co_2.xml) | The statistical post-processing (residual correction of a numerical model) that VAAYU generalises; basis of the bias-correction improvement. |

## 5. Related work (correcting physics-model air-quality forecasts)

| Reference | Relevance |
|---|---|
| *A Deep Learning approach to de-bias Air Quality forecasts, using heterogeneous Open Data sources and reanalysis data* — ECMWF Summer of Weather Code (AQ-BiasCorrection), **EGU22-1255**. [meetingorganizer.copernicus.org/EGU22/EGU22-1255.html](https://meetingorganizer.copernicus.org/EGU22/EGU22-1255.html) | ML correction of CAMS PM2.5 forecasts against OpenAQ stations (per-site). VAAYU differs: spatial graph, fire nodes, coupled met+chem, 72 h rollout. |
| *Improving WRF-Chem PM2.5 predictions by combining data assimilation and deep-learning-based bias correction.* **Environment International** (2024). [sciencedirect.com/science/article/pii/S0160412024007864](https://www.sciencedirect.com/science/article/pii/S0160412024007864) | Deep-learning bias correction on top of WRF-Chem — the same hybrid physics + ML idea applied to the model family MoES uses. |
