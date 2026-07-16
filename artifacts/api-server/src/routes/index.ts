import { Router, type IRouter } from "express";
import healthRouter from "./health";
import dashboardRouter from "./dashboard";
import prospectsRouter from "./prospects";
import hypothesesRouter from "./hypotheses";
import gtmSignalsRouter from "./gtm-signals";
import demoRouter from "./demo";

const router: IRouter = Router();

router.use(healthRouter);
router.use(dashboardRouter);
router.use(prospectsRouter);
router.use(hypothesesRouter);
router.use(gtmSignalsRouter);
router.use(demoRouter);

export default router;
